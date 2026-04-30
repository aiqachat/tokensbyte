# TokensByte Relay 中枢开发规范

> **适用范围**: `backend/src/relay/` 目录下的所有模块。  
> **最后更新**: 2026-04-27  
> **目的**: 确保所有模型转发、计费、日志、异步任务、素材处理的逻辑完整一致，防止新功能扩展时引入 bug 或遗漏。

---

## 一、整体架构总览

```
┌──────────────────────── Relay 中枢 ────────────────────────┐
│                                                             │
│  ┌─── OpenAI 兼容层 ───┐    ┌─── 多模态原生层 (Native) ───┐ │
│  │ mod.rs  (chat)       │    │ native.rs                    │ │
│  │ image.rs             │    │   ├ gemini_proxy             │ │
│  │ video.rs             │    │   ├ volcengine_submit        │ │
│  │                      │    │   ├ volcengine_status        │ │
│  │ 入口: /v1/...        │    │   ├ volcengine_images        │ │
│  └──────────┬───────────┘    │   └ ark_asset_proxy          │ │
│             │                └──────────┬───────────────────┘ │
│             ▼                           ▼                     │
│  ┌─────────────── 共享基础设施 ──────────────────┐            │
│  │ proxy.rs         — 用户上下文/鉴权/日志/扣费   │            │
│  │ forward.rs       — 转发规则解析/请求体转换     │            │
│  │ router.rs        — 渠道选择/负载均衡           │            │
│  │ usage_extractor.rs — Token 用量/图片数量提取   │            │
│  │ stream.rs        — SSE 流式处理与计费          │            │
│  │ task.rs          — 通用异步任务轮询(GET)       │            │
│  │ task_poller.rs   — 后台自动轮询定时器          │            │
│  │ asset_convert.rs — 素材 URL→素材ID 自动转换    │            │
│  │ url_utils.rs     — URL 拼接工具                │            │
│  └────────────────────────────────────────────────┘           │
│                         ▼                                     │
│              mod.rs::compute_cost()  ← 统一计费引擎           │
└───────────────────────────────────────────────────────────────┘
```

---

## 二、⚠️ 双轨同步原则

### 2.1 双轨定义

| 层级 | 文件 | 入口路径 | 职责 |
|------|------|---------|------|
| **OpenAI 兼容层** | `mod.rs`(chat), `image.rs`, `video.rs` | `/v1/chat/completions`, `/v1/images/generations`, `/v1/video/generations` | 解析 OpenAI 标准结构，通过 `forward.rs` 适配后分发上游 |
| **Native 原生层** | `native.rs` | `/v1beta/models/{model}:*`, `/api/v3/...` | 直接桥接大厂官方路径和协议，100% 原生支持 |
| **通用任务轮询** | `task.rs`, `task_poller.rs` | `/v1/tasks/{task_id}`, 后台定时 | 异步任务状态查询与自动结算（两层共用） |

### 2.2 🚨 强制同步规则

**凡修改涉及以下任何一点，必须同时在 OpenAI 兼容层和 Native 层进行对等审查和修改：**

| 类别 | 涉及关键词 | 示例 |
|------|-----------|------|
| **Token/Usage 解析** | `parse_usage`, `usageMetadata`, `usage` | 新增 cached_tokens 字段 |
| **计费逻辑** | `compute_cost`, `pre_deduction`, `billing_detail` | 新增视频分辨率阶梯计费 |
| **特征提取** | `extract_request_features`, `ExtractedFeatures` | 新增 has_video / has_audio 检测 |
| **图片/资源计数** | `count_response_images` | 支持新的响应格式 |
| **预扣费冻结/退还** | `pre_deduct`, "冻结", `apply_balance` | 调整退款逻辑 |
| **请求/响应日志** | `record_and_bill`, `record_and_bill_with_prededuction` | 新增字段 |
| **参数安全过滤** | 白名单、敏感内容拦截 | 新增请求参数校验 |
| **异步任务判定** | `task_id` 提取、状态归一化 | 支持新上游状态码 |

### 2.3 反面教材

```
❌ "只改了 video.rs 的 Token 提取逻辑，native.rs 的 volcengine_status 照旧 → Native 入口 0 扣费"
❌ "只在 image.rs 加了按张计费，volcengine_images 中忘了提取图片数量 → Native 入口固定 1 张"  
❌ "在 extract_request_features 新增了 has_video 检测，但只在 mod.rs 聊天入口调用 → 视频模型含视频参考的费率判定失效"
```

---

## 三、计费流水线规范

### 3.1 统一计费流程（所有入口必须遵守）

```
请求进入
  ↓
1. get_user_context()         — 获取用户组、余额、等级折扣
  ↓
2. check_access()             — 模型权限 + 余额检查 → 返回 pre_deduction
  ↓
3. select_channel_for_model() — 渠道路由（含卡池）
  ↓
4. resolve_forward_rule()     — 转发规则解析（path/auth/asset_convert/poll_path）
  ↓
5. transform_request_body()   — 请求体格式转换
  ↓
6. 发送上游请求
  ↓
7. [同步] → 提取 usage → compute_cost() → record_and_bill()
   [异步] → POST 阶段只冻结 pre_deduction → GET 轮询成功后结算
```

### 3.2 compute_cost() 引擎规则

`compute_cost()` 是**唯一的计费入口**，位于 `mod.rs`。所有 handler 必须通过它计算最终费用。

#### 计费类型 (`billing_type`)

| 类型 | 说明 | 依赖的 Features 字段 |
|------|------|---------------------|
| `tokens` | 按 prompt/completion Tokens 计费 | `has_video`, `has_audio`, `service_tier`, `resolution` |
| `requests` | 按次/按张计费 | `image_count` |
| `duration` | 按时长(秒)计费 | `duration_seconds`, `resolution` |

#### ⚠️ ExtractedFeatures 完整性契约

所有 handler 在调用 `compute_cost()` 前，必须确保 `ExtractedFeatures` 包含以下完整数据：

```rust
ExtractedFeatures {
    has_video,           // 请求体中是否包含视频素材引用
    has_audio,           // 请求体中是否包含音频或语音生成标记
    duration_seconds,    // 视频时长（秒），视频模型必填，兜底 5.0
    resolution,          // 分辨率字符串，如 "720p"、"1080p"
    image_count,         // 图片数量：同步从响应提取，异步从终态提取
    service_tier,        // 服务等级，如 "flex"（离线推理折扣）
}
```

**关键规则：**

1. **has_video 不能只看 category**：即使模型类别是"视频"，也必须从请求体的 `content[]` 数组中检测是否**实际包含 video_url 引用**（影响 Seedance 2.0 含/不含视频参考的费率差异）。
2. **image_count 以响应为准**：请求体的 `n` 只是预期值，`count_response_images()` 的返回值才是计费最终依据。
3. **duration 兜底**：视频模型在 POST 阶段通过 `forward.rs` 默认注入 `duration: 5`，GET 阶段必须从原始请求或上游响应补充，不能为 None。
4. **异步任务 GET 阶段特征补充**：GET 响应通常不含 resolution/duration/has_video 等请求参数，必须从 `original_request`（日志中的 request_content）反序列化补充。

### 3.3 折扣优先级

```
模型全站折扣(site_discount_enabled=1) > 用户等级折扣(user_levels.discount)
```

统一通过 `proxy::resolve_discount()` 获取，禁止在各 handler 中自行计算。

### 3.4 预扣费生命周期

```
POST 阶段: check_access() → pre_deduction > 0 → pre_deduct(扣余额)
                                                  ↓
                                    record_and_bill(cost=pre_deduction, billing_detail="冻结")
                                                  ↓
GET 轮询阶段:
  ├── succeeded → compute_cost() → apply_balance = cost - pre_deduction
  │                                  → UPDATE logs (解除冻结)
  │                                  → UPDATE users balance -= apply_balance
  │
  └── failed → REFUND pre_deduction → UPDATE users balance += pre_deduction
                                     → UPDATE logs (标记失败)
```

**关键约束：**
- `billing_detail` 包含"冻结"字样 = 尚未结算
- `billing_detail` 不含"冻结" = 已结算完毕，禁止重复扣费（`already_billed` 守卫）
- 无论 cost 是否为 0，成功时都必须写入 billing_detail 以解除冻结状态

---

## 四、Usage 提取规范 (`usage_extractor.rs`)

### 4.1 parse_usage() 兼容性矩阵

| 提供方 | 结构路径 | 字段映射 |
|--------|---------|---------|
| OpenAI / 火山方舟聊天 | `usage.prompt_tokens` / `usage.completion_tokens` | 直接映射 |
| Google Gemini | `usageMetadata.promptTokenCount` / `usageMetadata.totalTokenCount` | completion = total - prompt |
| 火山视频终态 | `final_result.usage.*` | 同 OpenAI |
| 包裹格式 | `data.usage.*` | 同 OpenAI |
| SSE 流式 | 逐行解析 `data: {...}` 中的 usage 块 | 取最后一条 |

### 4.2 新增上游格式时的 Checklist

- [ ] 在 `parse_usage()` 的 `extract_from_value` 闭包中增加新分支
- [ ] 在 `extract_usage_json_string()` 中增加对应的 usage 节点提取
- [ ] 如果是 SSE 格式，确认 `data: ` 前缀和 `[DONE]` 处理兼容
- [ ] 更新本文档的兼容性矩阵

### 4.3 extract_request_features() 扩展规则

新增检测维度时：

1. 在 `ExtractedFeatures` struct 中添加字段（带 `Option` 或默认值）
2. 在 `extract_request_features()` 中实现提取逻辑
3. **同时扫描所有 content 来源**：
   - `messages[].content[]`（OpenAI 多轮对话）
   - 顶层 `content[]`（火山方舟格式）
   - 顶层 `videos[]` / `images[]`（扁平格式）
   - `modalities[]`（OpenAI 音频标记）
   - `generate_audio`（火山音频标记）
4. 在 `compute_cost()` 中添加对应的计费分支
5. 更新所有 handler 中的 features 构建逻辑

---

## 五、异步任务轮询规范

### 5.1 三层轮询架构

| 层级 | 文件 | 触发方式 | 适用场景 |
|------|------|---------|---------|
| **OpenAI 兼容轮询** | `video.rs::video_generations_status` | 用户 GET `/v1/video/generations/{task_id}` | OpenAI 格式客户端 |
| **通用任务轮询** | `task.rs::task_status` | 用户 GET `/v1/tasks/{task_id}` | 跨模型通用入口 |
| **Native 轮询** | `native.rs::volcengine_status` | 用户 GET `/api/v3/contents/generations/tasks/{id}` | 火山原生客户端 |
| **后台自动轮询** | `task_poller.rs::poll_pending_tasks` | 定时 120s | 保底：用户不轮询时兜底结算 |

### 5.2 状态归一化

所有轮询 handler 必须统一使用以下状态映射：

```rust
let task_status = match raw_status {
    "completed" | "succeeded" => "succeeded",
    "failed" => "failed",
    other => other,  // "pending", "processing", "running" 等
};
```

**⚠️ 新增上游状态值时，必须在所有四个轮询入口同步更新映射。**

### 5.3 轮询 URL 构建优先级

```
1. 转发规则 poll_path（如 "/custom/status/${task_id}"）
2. target_type == "volcengine" → "/api/v3/contents/generations/tasks/{task_id}"  
3. 从 upstream_path 派生 → "{upstream_path}/{task_id}"
4. 默认回落 → "/v1/video/generations/{task_id}" 或 "/v1/tasks/{task_id}"
```

### 5.4 已结算守卫

所有 GET 轮询必须实现 `already_billed` 检查：

```rust
// billing_detail 不含"冻结" = 已结算，阻断重复扣费
if let Some(detail) = b_detail {
    if !detail.is_empty() && !detail.contains("冻结") {
        already_billed = true;
    }
}
```

### 5.5 原始请求特征回溯

异步任务的 GET 响应通常缺少请求参数（resolution、duration、has_video 等）。  
必须从日志的 `request_content` 或 `upstream_req_content` 反序列化获取原始特征：

```rust
// 必须执行的特征补充（不可省略）
if let Some(ref req_str) = original_request {
    if let Ok(req_json) = serde_json::from_str::<serde_json::Value>(req_str) {
        let req_feat = extract_request_features(&req_json);
        if features.resolution.is_none()        { features.resolution = req_feat.resolution; }
        if features.duration_seconds.is_none()   { features.duration_seconds = req_feat.duration_seconds; }
        if req_feat.has_video                    { features.has_video = true; }
        if req_feat.has_audio                    { features.has_audio = true; }
        if features.service_tier.is_none()       { features.service_tier = req_feat.service_tier; }
    }
}
```

---

## 六、转发规则 (`forward.rs`) 规范

### 6.1 ResolvedForward 结构

```rust
ResolvedForward {
    target_type,    // "openai" | "volcengine" | "volcengine_chat" | "volcengine_image" | "gemini" | "gemini_image" | "anthropic"
    upstream_path,  // 上游 URL 路径，支持 ${model} 变量
    auth_type,      // "bearer" | "query_key" | "x-api-key"
    asset_convert,  // 是否启用素材 URL→素材ID 自动转换
    poll_path,      // 异步任务自定义轮询路径
}
```

### 6.2 新增 target_type 的 Checklist

- [ ] `forward.rs::transform_request_body()` — 添加请求体转换分支
- [ ] `forward.rs::transform_sse_line()` — 添加 SSE 流式转换分支（如有流式）
- [ ] `forward.rs::infer_forward_from_base_url()` — 添加域名推断逻辑
- [ ] `forward.rs::build_auth_headers()` — 添加鉴权方式（如与现有不同）
- [ ] `usage_extractor.rs::parse_usage()` — 确认 usage 格式兼容
- [ ] `mod.rs::transform_chat_response()` — 添加非流式响应转 OpenAI 格式逻辑
- [ ] 更新本文档的 target_type 表

### 6.3 请求体转换安全规则

- **视频模型默认参数兜底**：`forward.rs` 在 `category == "视频"` 时强制注入 `resolution: "720p"` 和 `duration: 5`（若未指定），确保上游数据与计费一致。
- **白名单透传**：火山方舟视频/图片的控制参数通过 `VOLCENGINE_CONTENT_PASSTHROUGH_KEYS` 白名单驱动，新增参数只需追加一行。
- **web_search 转换**：`convert_web_search()` 将 OpenAI 风格的 `web_search: true` 适配到各平台的联网搜索参数格式。

---

## 七、素材转换 (`asset_convert.rs`) 规范

### 7.1 触发条件

仅当 `ResolvedForward.asset_convert == true` 时执行。在以下两个入口触发：
- `video.rs::video_generations()` — OpenAI 兼容层
- `native.rs::volcengine_submit()` — Native 层

### 7.2 去重策略

```
网络 URL → 下载资源 → SHA-256 哈希 → 基于 content_hash 精确去重
Base64   → 解码 → SHA-256 哈希 → 去重 → TOS 临时上传 → CreateAsset
```

### 7.3 错误处理

- 素材转换失败**不阻塞**主请求：保持原始 URL 不变，让上游自行处理
- 必须输出完整的错误诊断信息（fail_code + fail_reason + Debug 输出）
- 转换日志记录在 `asset_convert_log` 中，追加到 `billing_detail` 便于排查

### 7.4 新增素材类型

如需支持新的素材类型（如字幕、3D 模型等）：
1. 在 `URL_TYPE_MAP` 中添加 `(content_type, url_key, asset_type)` 映射
2. 在 `BASE64_MIME_EXT` 中添加对应的 MIME → 扩展名映射
3. 确保 `extract_request_features()` 能检测到新类型（如 `has_subtitle`）
4. 确保 `compute_cost()` 中有对应的计费处理

---

## 八、日志记录规范

### 8.1 record_and_bill 参数规约

| 参数 | 说明 | 注意事项 |
|------|------|---------|
| `endpoint` | 格式 `"系统路径\|上游路径"` | 用 `\|` 分隔，前者入日志 endpoint 字段，后者拼接 base_url 后入 upstream_url |
| `request_content` | 用户原始请求体 | 受 `enable_log_content` 开关控制，关闭时不存入 |
| `response_content` | 上游最终响应体 | 视频/图片类始终保留；聊天类关闭日志时仅存 usage JSON |
| `upstream_req_content` | 转换后的实际上游请求体 | 受 `enable_log_content` 开关控制 |
| `billing_detail` | 计费明细文本 | 异步任务 POST 阶段必须含"冻结"关键字 |

### 8.2 Base64 脱敏

所有存入数据库的请求/响应内容，由 `filter_content()` 自动脱敏：
- `data:*;base64,` 长串 → `"base64数据"`
- 超过 200 字符的纯 base64 串 → `"base64数据"`

### 8.3 密钥脱敏

通过 `forward::mask_key_in_string()` 处理 upstream_url 中的 API Key：
- 长度 > 8: 保留首尾各 4 字符，中间 `******`
- 长度 ≤ 8: 全部替换为 `******`

---

## 九、新功能/新模型接入 Checklist

### 9.1 新增模型类别（如"语音"、"3D"等）

- [ ] 在 `model_types` 表中注册新类别
- [ ] `forward.rs::infer_forward_from_base_url()` 添加域名→类别推断
- [ ] `forward.rs::transform_request_body()` 添加请求体转换（如需要）
- [ ] `usage_extractor.rs` 确认 usage 格式兼容
- [ ] `extract_request_features()` 新增特征检测字段
- [ ] `compute_cost()` 新增计费分支
- [ ] 如果是异步任务：
  - [ ] `task_poller.rs` 确认 entry_path 类别映射
  - [ ] `task.rs::task_status()` 确认 default_entry 类别映射
  - [ ] 确认状态归一化覆盖新上游的状态值
- [ ] `proxy.rs::record_and_bill_with_prededuction()` 中确认 `filter_content` 的分类兜底处理
- [ ] 在 Native 层添加对等的 handler（如有原生 API 路径）
- [ ] **更新本文档**

### 9.2 新增上游提供商（如新的 AI 厂商）

- [ ] `forward.rs` 添加 target_type 和对应的转换/鉴权逻辑
- [ ] `usage_extractor.rs` 添加 usage 解析兼容
- [ ] `stream.rs` 添加 SSE 格式适配（如有流式）
- [ ] `mod.rs::transform_chat_response()` 添加响应格式转换
- [ ] `forward.rs::infer_forward_from_base_url()` 添加域名推断
- [ ] 确认计费规则是否需要新的 billing_type / billing_rule
- [ ] 在 Native 层评估是否需要独立 handler
- [ ] **更新本文档**

### 9.3 修改计费逻辑

- [ ] 修改 `compute_cost()` 中的计算公式
- [ ] 审查所有 handler 是否正确传递了影响计费的 features
- [ ] 确认 `extract_request_features()` 能提取到计费所需的新字段
- [ ] 确认异步任务 GET 阶段的特征回溯逻辑覆盖新字段
- [ ] 确认 `task_poller.rs` 后台轮询的计费逻辑同步更新
- [ ] 测试所有入口路径（OpenAI 兼容层 + Native 层 + 通用任务轮询 + 后台轮询）

---

## 十、历史 Bug 典型复盘

### 10.1 视频含视频参考未检测导致计费偏低

**根因**: Seedance 2.0 模型含/不含视频参考的单价不同。`extract_request_features()` 未检测请求体 `content[]` 中的 `video_url` 类型元素，导致 `has_video` 始终为 false，走了低价格档。

**修复**: 在 `extract_request_features()` 中遍历 `messages[].content[]` 和顶层 `content[]`，检测 `type` 含 "video" 的元素。

**教训**: 计费特征字段必须覆盖所有可能的请求格式（OpenAI 多轮 + 火山方舟扁平 + 直通模式）。

### 10.2 Native 层 volcengine_status 零扣费

**根因**: 在 `video.rs` 中完善了 GET 轮询的计费逻辑，但忘记在 `native.rs::volcengine_status` 中做对等修改。

**修复**: 补齐 Native 层的 feature 提取 + compute_cost 调用。

**教训**: 双轨同步原则，任何计费相关修改必须全文搜索所有使用点。

### 10.3 素材处理失败显示"未知原因"

**根因**: 火山方舟 GetAsset API 返回 `Status: "Failed"` 但 `FailReason` 为空。代码仅读取 `fail_reason` 字段，用 `unwrap_or("未知原因")` 兜底。

**修复**: 增加 `FailCode` 字段解析，当两者均为空时输出完整的 `GetAssetResponse` Debug 信息。

**教训**: 上游 API 的错误字段不可信任为必填，必须有诊断性兜底（输出完整原始响应）。

---

## 十一、代码搜索速查

| 需求 | 搜索关键词 |
|------|-----------|
| 查找所有计费入口 | `compute_cost` |
| 查找所有日志记录点 | `record_and_bill` |
| 查找所有 usage 解析 | `parse_usage` |
| 查找所有特征提取 | `extract_request_features` |
| 查找所有预扣费 | `pre_deduct` |
| 查找所有异步任务判定 | `already_billed`, `"冻结"` |
| 查找所有渠道选择 | `select_channel_for_model` |
| 查找所有转发规则 | `resolve_forward_rule` |
| 查找所有素材转换 | `asset_convert`, `convert_content_urls` |
| 查找所有 task_id 提取 | `extract_task_id`, `task_id` |

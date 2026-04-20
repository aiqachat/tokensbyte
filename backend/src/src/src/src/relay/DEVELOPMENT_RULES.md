# TokensByte Relay 中枢开发核心法则 (Critical Architecture Rule)

## ⚠️ 双轨同步原则 (Dual-Track Synchronization Principle)

TokensByte 的请求处理与中转架构分为 **双软硬轨：**

1. **OpenAI 兼容层 (OpenAI-Compatible Layer)**
   - 文件：`chat.rs`、`image.rs`、`video.rs` 等。
   - 特征：负责解析 `/v1/chat/completions`、`/v1/images/generations` 等官方结构，转换后分发给上游（比如 OpenAI / 自定义中转）。

2. **多模态原生层 (Native API Layer)**
   - 文件：`native.rs` (包含 `gemini_proxy`, `volcengine_submit`, `volcengine_images`, `volcengine_status` 等)。
   - 特征：直接暴露出大厂官方特有的请求路径和结构协议，直接桥接上游（不改变 request body 的核心形态），提供 100% Native 支持。

### 🚨 绝对开发准则
**只要修改涉及以下任何一点，必须强制要求开发人员在两边均进行代码审查和同步修改：**
- **Token 解析逻辑** (`usage`, `usageMetadata` 字段解析)
- **计费及扣费核心计算** (`compute_cost`, 预扣费冻结及退还流程)
- **参数过滤、白名单校验** (安全过滤内容、特殊模型校验规则)
- **请求/响应流水账入库记录** (`record_and_bill` 调用)
- **异步任务轮询设计** (POST/GET 的状态同步机制)

### 常见开发反面教材致盲点
- “视频/图片异步任务请求，只去调了 `video.rs` 里面的 Token获取逻辑，认为这就完事了，结果 Native 层的方舟模型调用全都跑成了 0 扣费。”
- 应对规则：完成功能调整后，不仅要搜索 `video` 模块，必须在 `native.rs` 中检索到对应的 `volcengine_submit` 与 `volcengine_status` 进行对等逻辑改造！

凡是添加新业务模块，工程师必须主动排查 Native 层是否存在相同形态的旁路逻辑，杜绝账单遗漏与记录留白！

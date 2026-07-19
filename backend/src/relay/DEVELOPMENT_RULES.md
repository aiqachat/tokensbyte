# TokensByte Relay 中枢开发规范

> **适用范围**: `backend/src/relay/` 目录下的所有模块。  
> **最后更新**: 2026-07-15  
> **目的**: 确保模型转发、计费、日志、异步任务、HA 逻辑一致，防止扩展时引入遗漏。

---

## 一、整体架构总览

```
┌──────────────────────── Relay 中枢 ────────────────────────┐
│  OpenAI 兼容层              多模态原生层 (Native)            │
│  chat.rs / image.rs         native.rs (gemini / volc / ark) │
│  video.rs / audio.rs                                        │
│  generic.rs                                                 │
│            │                         │                      │
│            ▼                         ▼                      │
│  共享: proxy.rs / forward.rs / router.rs / ha.rs            │
│        usage_extractor.rs / stream.rs / task.rs             │
│        asset_convert.rs / url_utils.rs / response_formatter │
│            ▼                                                │
│  mod.rs::compute_cost() / calculate_relay_cost()            │
└─────────────────────────────────────────────────────────────┘
```

| 模块 | 职责 |
|------|------|
| `chat.rs` | Chat Completions / Responses |
| `image.rs` / `video.rs` / `audio.rs` / `generic.rs` | 对应模态入口 |
| `native.rs` | Gemini / 火山原生路径 |
| `proxy.rs` | 鉴权、预扣费、PendingLog/BillRecord、记账 |
| `ha.rs` | HA 策略、`HaAttempt`、首次失败 reinstate |
| `stream.rs` | SSE 流式 + 流后结算 |
| `task.rs` | 异步任务查询与结算（含后台轮询） |

---

## 二、双轨同步原则

| 层级 | 文件 | 入口 |
|------|------|------|
| OpenAI 兼容 | `chat.rs`, `image.rs`, `video.rs`, `audio.rs` | `/v1/...` |
| Native | `native.rs` | `/v1beta/...`, `/api/v3/...` |
| 任务轮询 | `task.rs` | `/v1/tasks/{id}` + 后台定时 |

**凡改 Usage / 计费 / 特征 / 预扣费 / 日志 / 异步判定，必须同时审查兼容层与 Native 层。**

---

## 三、一条日志原则 + 记账 API

1. 请求前：`proxy::record_pending_log(PendingLog { ... })` → `status_code=0`
2. 完成后：`proxy::record_and_bill_inner(BillRecord { ... })` 传入同一 `pending_log_id`（UPDATE，禁止再 INSERT）
3. HA 重试复用同一条 pending；非首次失败由 `ha::reinstate_first_log` 还原首次子渠快照

### PendingLog / BillRecord

命名字段传参，禁止位置参数。关键字段：

| 结构 | 要点 |
|------|------|
| `PendingLog` | `category`、`forward_eid`、`db_model`、`requested_log_id` |
| `BillRecord` | `hint_category`、`pending_log_id`、`pre_deducted` / `pre_deduct_gift`、`billing_detail` |

### 预扣费

```rust
proxy::pre_deduct_or_intercept(..., category).await
// admin / amount≤0 跳过；失败写 403 日志并返回 AppError
```

禁止各端点手写 `pre_deduct` + 403 落库副本（除非有特殊不可复用路径）。

---

## 四、HA（`ha.rs`）

```rust
let mut ha = HaAttempt::begin(&state, token.high_availability).await;
while ha.cont() {
    // select → ha.on_select_err / access → ha.on_access_err
    // spawn 内同步 BillRecord 错误落库后 return Err(e)
    if ha.on_spawn_result_err(&state, &channel, e, Some(&url)).await {
        ha.bump(); continue;
    }
    break;
}
Err(ha.finish())
```

- `on_spawn_result_err`：spawn 外环统一入口——余额/鉴权等业务错误走 `on_access_err`（禁止 reinstate 覆盖 403）；上游错误走 `on_spawn_fail`
- `on_spawn_fail` / `on_spawn_attempt_fail`：记首次失败、熔断、非首次 reinstate；返回是否 continue
- 多模型外环（chat）：一个 `HaAttempt` + 每模型 `reset_attempts()`（清 attempt/排除/had_upstream，保留 pending + first_fail）
- 不可 failover（余额不足等）：`ha.on_access_err(e); break`
- HA 重载（轮询/取消/列表）：必须 `router::fetch_channel(state, channel_id, channel_config_id)`，禁止只读父渠 + preset
- 日志子配快照只存 `channel_config_id`；展示 YID 由 JOIN `channel_configs` 得到

---

## 五、计费流水线

```
get_user_context → check_access → select_channel → resolve_forward_rule
  → transform_request_body → 上游
  → [同步] usage → calculate_relay_cost → BillRecord
  → [异步] POST 冻结 pre_deduction → GET/轮询结算
```

- 唯一计费入口：`mod.rs` 的 `compute_cost` / `calculate_relay_cost`
- 折扣：`proxy::resolve_discount`（禁止各 handler 自算）
- 流式结算：`stream.rs::settle_after_stream`（各 handler 只保留 usage/features 提取）

### ExtractedFeatures 契约

调用计费前须填齐：`has_video` / `has_audio` / `duration_seconds` / `resolution` / `image_count` / `service_tier` 等。  
`has_video` 必须检测请求体实际引用，不能只靠类别名。

### 预扣费生命周期

POST 冻结（`billing_detail` 含「冻结」）→ GET 成功结算 / 失败退还。  
不含「冻结」= 已结算，禁止重复扣费（`already_billed`）。

---

## 六、Usage / 转发 / 素材（摘要）

- Usage：`usage_extractor::parse_usage`（OpenAI / Gemini / 火山 / SSE）
- 转发：`forward.rs`（`ResolvedForward`、`target_type`、白名单透传）
- 素材：`asset_convert.rs`（仅 `asset_convert==true`；失败不阻塞主请求）
- 异步任务：状态归一化 + `already_billed` + 从 `request_content` 回溯特征；轮询逻辑在 `task.rs`
- 宽日志查询（>16 列）：用 `TaskRelayLogRow` + `FromRow` 一次查出，禁止拆成二次 query / 超长元组

---

## 七、新功能 Checklist（精简）

- [ ] 兼容层 + Native 对等审查
- [ ] PendingLog/BillRecord 命名字段 + 一条日志
- [ ] HA 用 `HaAttempt`，错误路径走 `on_spawn_result_err`
- [ ] 预扣费用 `pre_deduct_or_intercept`
- [ ] features / usage / 异步冻结结算完整
- [ ] HA 重载（轮询/取消/列表）用 `fetch_channel(..., channel_config_id)`
- [ ] 更新本文档日期与相关表

---

## 八、搜索速查

| 需求 | 关键词 |
|------|--------|
| 计费 | `calculate_relay_cost`, `compute_cost` |
| 日志 | `PendingLog`, `BillRecord`, `record_pending_log` |
| HA | `HaAttempt`, `on_spawn_fail`, `reinstate_first_log` |
| 预扣费 | `pre_deduct_or_intercept` |
| Usage / 特征 | `parse_usage`, `extract_request_features` |
| 异步 | `already_billed`, `"冻结"`, `TaskRelayLogRow` |

# UPDATE

## 2026-07-20 — 金额精度统一为小数点后 6 位

### 约定
站点内部账本（日志 cost、扣费结算、余额/赠送金/信控、充值调账、额度用量）一律保留 **6 位小数**（四舍五入）。
支付通道对外法币金额（微信/支付宝等）仍按通道要求保留 2 位，不在此范围。

### 改动
- 后端新增 `money::round_money`，接入余额 API、管理员充值、计费结算、预扣拆分、额度微单位
- 前端日志/财务/钱包/用户/令牌/渠道/仪表盘等金额展示统一 `toFixed(6)` / `precision={6}`
- `frontend/src/utils/money.ts` 提供统一常量与格式化函数

### 部署
前后端同步发布；无新库迁移。

---

## 2026-07-20 — 安全加固：代登鉴权 / OAuth State / 验证码防爆破

### 问题（安全检测 P0）
1. 代登接口 handler 未显式校验管理员 Claims（虽路由层有 middleware，缺少防御纵深）
2. OAuth state 存在过松兼容路径：任意 `wechat_XXXXX` 可通过校验，绕过 HMAC
3. 邮箱/短信验证码无尝试次数限制，6 位数字可暴力破解

### 改动
- `impersonate_user`：强制 `role == admin`，并记录审计日志
- 删除 OAuth state 前缀兼容分支；仅接受服务端 HMAC 签发；登录页/注册页改为请求 `/auth/oauth/state`
- 绑定/换绑微信与谷歌 state 同样改为 HMAC 签发（`/user/bind/oauth-state`）
- `verification_codes` 新增 `attempts` 列；错误超 3 次作废；有效期改为 5 分钟

### 部署
重启后端以执行迁移 `verification_codes_attempts_v1`；前端需同步发布。

---

## 2026-07-20 — 修复 TIMESTAMPTZ 与 TEXT 比较导致 Internal database error

### 问题
列改为 `TIMESTAMPTZ` 后，部分接口仍用字符串参数做 `created_at >= ?`，PostgreSQL 报错：
`operator does not exist: timestamp with time zone >= text`。
前端表现为：日志/任务列表有时能出数据，同时弹出 **Internal database error**（并行 COUNT/列表或其它带时间筛选的接口失败）。

### 改动
所有对 `TIMESTAMPTZ` 列的范围比较统一为 `?::timestamptz`（含 logs 已有路径、dashboard / finance / auth / user wallet / team_marketing / happyhorse / `date_helper::sql_cond`）。

### 部署
重启后端使新二进制生效即可（无新迁移）。

---

## 2026-07-19 — 时间体系统一：线上自检 / 财务用户展示 / logs 归档

### ① 线上自检 SQL（TIMESTAMPTZ）

在业务库执行，确认迁移 `timestamptz_unify_v1` 已落地：

```sql
-- 1) 迁移是否执行
SELECT id, executed_at FROM sys_migration_history
WHERE id IN ('timestamptz_unify_v1', 'logs_archive_v1')
ORDER BY id;

-- 2) 关键表时间列类型（期望 timestamp with time zone）
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name, column_name) IN (
      ('logs', 'created_at'),
      ('users', 'created_at'),
      ('users', 'updated_at'),
      ('orders', 'created_at'),
      ('orders', 'paid_at'),
      ('recharge_records', 'created_at'),
      ('commissions', 'created_at'),
      ('verification_codes', 'expires_at')
    )
  )
ORDER BY table_name, column_name;

-- 3) 仍为 text/varchar 的业务时间列（理想应为空；周期键 last_reset_* 除外）
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ~ '(created_at|updated_at|paid_at|expires_at|last_used_at|expire_at)$'
  AND data_type IN ('text', 'character varying')
  AND column_name NOT LIKE 'last_reset%'
ORDER BY table_name, column_name;

-- 4) logs 热表体量与索引
SELECT relname, n_live_tup, n_dead_tup
FROM pg_stat_user_tables WHERE relname IN ('logs', 'logs_archive');

SELECT indexname FROM pg_indexes
WHERE tablename = 'logs' AND indexname LIKE '%created%';
```

### ② 财务 / 用户页展示

- `formatApiDateTime` 改为按 **timedisplay**（用户时区 > 站点默认）直接格式化，不再依赖浏览器本地时区。
- 已切换：`GiftRecords` / `RechargeRecords` / `Users` / `AdminGroups` / `UserLevels`（订单详情此前已用）。

### ③ logs 分区 / 归档方案

**已落地（Phase 1 — 冷表归档）**

| 项 | 说明 |
|---|---|
| 表 | `logs_archive`（`LIKE logs` + `archived_at`） |
| 开关 | `storage_settings.log_row_retention_days`（默认 **0**=不归档） |
| 时机 | 每天凌晨详情清理后，分批每批 5000 行：先 INSERT 冷表再 DELETE 热表 |
| 缓冲 | 实际阈值 = 配置天数 **+2**，降低统计未落档风险 |
| 建议 | 大数据量站点：先校准 `usage_daily_stats`，再设 `90`；且 ≥ `log_retention_days` |

**Phase 2 — 原生月分区（运维窗口，按需）**

热表仍过大时，在维护窗口把 `logs` 改为 `PARTITION BY RANGE (created_at)`。要点：

1. 新建分区父表 + 按月子表（含未来 2～3 个月）。
2. `INSERT INTO logs_partitioned SELECT * FROM logs`（或按月批次）。
3. 交换表名 / 重建索引 / 切应用；旧表改名备份后再 DROP。
4. 冷表 `logs_archive` 可同样按月分区，或按年 DETACH 后迁对象存储。

> 未自动执行 Phase 2：线上改分区需短时锁表与校验，请单独排期。

### 部署

停旧后端 → 启新二进制跑迁移（含 `logs_archive_v1`）→ 管理端按需设置「日志行归档天数」→ 再开流量。

---

## 2026-07-19 — 重置密码/注册：获取验证码防刷

### 问题
重置密码页「获取验证码」可连点，`sendingCode` 为异步 state 拦不住并发请求，失败时也不开倒计时，导致错误弹窗刷屏。

### 改动
- `ForgotPassword` / `Register`：`useRef` 同步锁 + 请求中禁用按钮。
- 成功冷却 60s；失败短冷却 3s，避免连点刷 toast。

### 涉及文件
- `frontend/src/pages/Login/ForgotPassword.tsx`
- `frontend/src/pages/Login/Register.tsx`

## 2026-07-19 — 站点时间体系统一（落库 / 查询 / 展示）

### 改动
- `once_migration!`：任一句失败不写 history，支持重启重试。
- TIMESTAMPTZ 写入统一为 `DbTs::now()` / `CURRENT_TIMESTAMP`（去掉 `::text`、朴素字符串绑定时戳列）。
- 注册邀请日限额 / IP 日限额：`created_at LIKE` 改为站点 timedisplay 自然日 `[start, end)` 范围查询。
- 验证码校验：用 `expires_at > NOW()`，不再做字符串字典序比较。
- 前端 `timedisplay.ts` 导出 `formatApiDateTime` / `parseApiTimeAsUtc`；日志、订单、快乐小马等展示统一走该函数。

### 部署
停旧后端 → 启新二进制跑迁移 → 再开流量；勿与旧二进制混跑。

## 2026-07-19 — 全库时间列 TEXT → TIMESTAMPTZ

### 问题
绝大多数 `created_at`/`updated_at` 等以 TEXT 存储，logs 等热路径频繁 `::timestamptz` 转换，btree 索引难以有效服务时间范围查询，日志性能已顶不住。

### 改动
- 新增 `DbTs`（`TIMESTAMPTZ` ↔ API RFC3339 字符串），FromRow 模型时间字段统一改用该类型。
- 一次性迁移 `timestamptz_unify_v1`：业务时间列改为 `TIMESTAMPTZ`（周期键 `last_reset_*` 仍为 TEXT）。
- logs/dashboard/清理/归档等查询去掉列上 cast，改为对参数 `?::timestamptz`，便于走索引。
- 运行时写入将 `now()::text` 改为 `NOW()`。

### 部署注意
`logs` 大表 `ALTER TYPE` 会重写表并短时锁表，请安排维护窗口后重启后端以执行迁移。

### 涉及文件
- `backend/src/time_system/db_ts.rs`（新增）
- `backend/src/db/migrations.rs`
- `backend/src/models/*`、`backend/src/api/logs.rs`、`dashboard.rs`、`date_helper.rs` 等

## 2026-07-19 — 系统概览：日期口径对齐与范围标签

### 问题
管理端/用户端共用仪表盘，但「总*」大数字随筛选变化，今日/昨日副行与模型「近三天」却固定日历日，默认又落在「今天」，易被误判为数据错误。

### 改动
- 默认筛选改为「本月」，并恢复「全部」；有筛选时主指标文案跟随上方快捷标签（如「本月请求数」），今日/昨日副行仅在「今天/昨日」快捷项下显示。
- 标题旁标明数据范围：管理员「全站」/ 用户「仅本人」；管理端最近活动增加用户列。
- 模型明细近几日改为锚定筛选区间末日（≤ 今天）向内最多 3 天；「全部」仍为日历近 3 天。
- 最近活动查询关联 users，填充昵称/UID。

### 涉及文件
- `frontend/src/pages/Dashboard/Dashboard.tsx`
- `frontend/src/locales/zh.json` / `en.json`
- `backend/src/api/dashboard.rs`
- `backend/src/api/date_helper.rs`

## 2026-07-18 — 日志记录 / 任务列表：防连点与大数据量性能优化

### 问题
查询 / 重置 / 刷新在数据未返回时被疯狂点击，会叠加大量请求，浏览器与后端易被打崩；列表接口还把请求/响应大字段整包返回，数据量一大就更慢。

### 改动
- **前端**：新增 `QueryGuard`（新请求取消旧请求 + AbortController）；查询/重置/刷新按钮 loading 时禁用；取消中的请求不报错。
- **后端列表瘦身**：`/logs`、`/task_logs` 列表不再返回 `request_content` / `response_content` / `post_response` / `upstream_req_content`。
- **按需详情**：新增 `GET /logs/{id}/detail`；表格展开行与任务预览时再拉取大字段。
- **并行查询**：列表 COUNT / 数据 /（日志）汇总改为 `tokio::join!` 并行执行。

### 修复（同日）
- 去掉 1.2s 时间节流与“操作过于频繁”提示（StrictMode 重挂载会误伤首屏）。
- 全局 axios 拦截器忽略主动取消的请求，避免误报 `Network error`。

### 涉及文件
- `frontend/src/utils/queryGuard.ts`
- `frontend/src/utils/request.ts`
- `frontend/src/pages/Logs/Logs.tsx`
- `frontend/src/pages/Logs/TaskLogs.tsx`
- `backend/src/api/logs.rs`
- `backend/src/api/task_logs.rs`
- `backend/src/api/mod.rs`
- `backend/src/models/log.rs`

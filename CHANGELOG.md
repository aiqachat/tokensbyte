# UPDATE

## 2026-07-23 — 本地后端增量编译/链接加速（兼容 Windows）

- `[profile.dev]`：`debug = line-tables-only` + incremental。
- Windows：`dev.ps1` 默认设 `rust-lld`；`TOKENSBYTE_FAST_LINK=0` 回退 `link.exe`（不新增 `.cargo/config.toml`）。
- Linux：`dev.sh` 有 mold 则 `mold -run`，否则可选 `clang+lld`；macOS 不启用（`mold -run` 不支持）。
- 不改业务逻辑；无额外单测残留。

---

## 2026-07-23 — 级联转发规则：每分辨率可配增强版本与底座

- `config_json` 新增 `res_enhance`（fast|standard|pro|ai，默认 standard）、`res_scene`（标准版场景 common|ugc|short_series|aigc|old_film，默认 common）、`res_base`（阶段一座底，默认一级：720p→480p、1080p→720p、2k/4k→1080p）。
- 管理端级联配置按分辨率设置倍率/增强/场景（仅标准版显示）/底座；阶段二标准增强透传并校验 `scene`。
- 旧规则无新字段时增强默认标准、场景 common、底座一级，无需迁移；不保留级联相关验证单测残留。
- 级联 `version` / 目标 `resolution` 只写入 `plugin_tag.cascade`，不改用户入参；预扣费时用已有 `cascade_json_str` 写入 `billing_features`，终态直接复用快照。

---

## 2026-07-22 — 任务列表预览：列表返回产物地址，不受详情权限限制

根因：列表不带响应体，预览走详情接口；关闭「查看日志详情」时取不到媒体链。  
处理：`/task_logs` **一次查询**仅对图片/视频/视频增强读 `response_content`，内存提取 `preview_urls`（级联取 stage2，复用 `find_urls`，只回传 http(s)；日志内 base64 本已脱敏占位）后丢弃大字段；前端优先用 `preview_urls`，无详情权限时不再打详情兜底。详情权限仍约束完整展开，预览不受影响。

---

## 2026-07-22 — 新增用户增强插件「上游素材中转」

新增系统增强插件 `upstream_asset_relay`：可多条关联上游渠道与素材基础路径（路径可空），一键生成视频转发规则；模型选用后对请求内图片/音视频 URL 经渠道 Bearer 调用 CreateAsset/GetAsset 转为 `asset://`，带缓存与 `plugin_api_logs` 追溯。与现网 `asset_convert`（素材插件凭证）正交隔离，默认关闭，不影响原有行为。

---

## 2026-07-22 — 启动/定时清理：status_code=0 慢查询改走部分索引

`recover_interrupted_logs` / `cleanup_orphan_pending_logs` 原 SQL 对 400 万行 `logs` 全表扫（`status_code=0` + `NOT ILIKE '%冻结%'`，约 2s）。  
预记录默认 `is_completed=0`，改为先命中 `idx_logs_is_completed_pending` 再过滤；语义不变（异步冻结多为 `status_code=200`）。实测约亚毫秒级。

---

## 2026-07-22 — 修复 DbGate 卡 Loading structure（锁 + 损坏索引）

根因：多实例 StartupBackfill 长事务占 `logs` 锁，迁移非并发 `DROP INDEX` 与 DbGate 结构查询一起等待；另有损坏索引 `idx_logs_action_created_stats_new`（pg_attribute 缺口）干扰元数据。  
处理：运维侧已清损坏目录项并补齐 `idx_logs_created_at_agg`；`logs_indexes_reconcile_v1` 的 prune 增加 `lock_timeout=3s`，拿不到锁则跳过，不再堵库。

---

## 2026-07-22 — 去掉 migrations 验证单测

删除 `idempotent_index_ddl_tests`（`#[cfg(test)]` 不影响线上，但仓库不留验证残留）；幂等判断内联为单一私有函数，迁移终态与行为不变。

---

## 2026-07-22 — logs 索引迁移收口为 logs_indexes_reconcile_v1

- 旧 ID `logs_slow_query_indexes_v1` / `logs_created_at_agg_prune_v1` 改为 no-op（保留 history 兼容）。
- 新迁移 `logs_indexes_reconcile_v1` 为唯一终态：清 INVALID → 建 `idx_logs_created_at_agg` / `idx_logs_vision_created_at_new` → 尽力删冗余/损坏旧索引 → `ANALYZE`。
- `once_migration!` 仍对 CREATE 名冲突（23505）与 DROP 目录缺口（XX000）幂等跳过。重启后端执行一次即可。

---

## 2026-07-21 — 今日改动复查收口

- 腾讯视频：用户显式 `LastFrameUrl` 原样透传（可与 `FileInfos` 并存）
- 去掉 `PollTask` 内嵌套 `if is_tencent`
- 级联阶段二不再默认写 `bitrate_level: high`（恢复历史请求体，避免静默改变上游画质/计费）

---

## 2026-07-21 — 腾讯云 FileInfos 用户原样透传

用户已传 `FileInfos` 时图/视频 body 直接 `clone`，不做规范化改写；仅从 `images` 等兼容字段构建时仍走 `tc_file`。已删 `tc_norm_files`。

---

## 2026-07-21 — logs 日聚合索引补齐与冗余索引精简

- 新迁移 `logs_created_at_agg_prune_v1`（**未并入**已上远程的 `logs_slow_query_indexes_v1`，避免已执行环境跳过删冗余）
- 补齐 `idx_logs_created_at_agg`；删 `idx_logs_action_created_stats_new` 及旧名 `idx_logs_created_at*`（若有）
- 保留：pkey / log_id / task_id / user_id / action_created / vision / is_completed / status0；重启后端执行

---
## 2026-07-21 — 消除 LocalDayBounds.local_day dead_code 警告

`local_day` 仅赋值从未读取（调用方用 `start/end_utc` 或 RFC3339）；从结构体移除，边界计算不变。

---

## 2026-07-21 — 腾讯云 FileInfos 支持 Base64 输入

兼容字段（`images` 等）构建 `FileInfos`：base64 → `Type=Base64`+纯串，否则 `Url`（`tc_file`）。用户自带 `FileInfos` 见上方「原样透传」。

---

## 2026-07-21 — 清理无用单测与临时脚本

删除 `live_metrics` / `dashboard` 内 `#[cfg(test)]` 模块，以及根目录孤儿脚本 `test_plugins.js` / `test_plugins.sh`。不改业务路径；保留管理端「通道测试」等产品功能。

---

## 2026-07-21 — 级联阶段二防重复：DashMap 互斥

同进程 `cascade_s2_inflight` + RAII Guard（Drop 必 remove）。输家零查询 `InProgress`（对外仍走标准「进行中」）；无额外读库。裁剪固定角点 `(2,6)-(862,490)` / `(6,2)-(490,862)`。单实例部署，不做跨进程 CAS。

---

## 2026-07-21 — 手动轮询补齐腾讯云原始响应日志

根因：仅后台 `[TaskPoller]` 打印腾讯原始 body；用户手动 `[Task Poll]` 只打 `resp_len`。抽出 `log_tencent_poll_raw`，手动/自动/`PollTask` 共用；`is_tencent` 统一 `starts_with("tencent_vod")`。仅日志，结算与返回不变。

---

## 2026-07-21 — 腾讯视频终态分辨率覆盖计费特征

结算仅读终态 `Output.FileInfos[0].MetaData` 的 `Duration` / `Width` / `Height`（短边→480p/720p/1080p/2k/4k），覆盖请求侧任意分辨率；不读空/不可靠的 `Resolution`。在 `merge` 之后写入，避免被冲掉。

---

## 2026-07-21 — 级联阶段一 480p 非标居中裁剪

级联模式下阶段一为 480p 且 ratio 为 16:9/9:16 时，超分前走 MediaKit `crop-video` 居中裁成标准 480p（864×496→860×484 / 496×864→484×860）。逻辑在 `cascade.rs`，`task.rs` 阶段二提交复用；不命中不裁，失败回退原底座。

---

## 2026-07-21 — 启动慢 SQL：日统计回填 + 日志深翻页

### 现象
- 启动 `StartupBackfill`：`INSERT…SELECT` 聚合 `logs → usage_daily_stats` 超 1s（周批次可扫数十万行）。
- 日志列表：视觉类筛选 + 大 `OFFSET` 时，对 OFFSET 前全部行做 5 表 JOIN 与 `regexp_match(billing_detail)`。

### 改动（行为不变）
- `usage_stats`：按日 upsert；SQL 循环外编译复用；`FILTER` + `GROUP BY 1..6`；失败中止；仅日间 sleep。
- `list_logs` / `list_task_logs`：共用 `deferred_join_page_sql`；视觉 `= ANY(...)`；排序仅 `created_at DESC`。
- 迁移 `logs_slow_query_indexes_v1`：`idx_logs_created_at_agg`、`idx_logs_vision_created_at_new`。
- 验证用临时单测已删除，不留仓库残留。

---

## 2026-07-21 — 打包脚本精简原则

- **不抽** `docker-build-env` 公共文件（曾引入引用/漏改风险）；sh 与 ps1 各自独立、规则对齐即可。
- **不加** Docker 打包常驻单测（需本机 Docker/长编译，易碎；验证用 `bash -n` + 实跑导出）。
- `push-images.sh` 与 `export-images.sh`：Apple Silicon 默认 arm64，避免推送路径默认踩 QEMU。

---

## 2026-07-21 — 本地打包提速（不影响线上）

### 原则
只改构建过程；运行时镜像仍是 release Linux ELF + nginx，部署/更新方式不变。

### 改动
- 构建顺序：`frontend` → `backend`（先轻后重，给 Rust 腾内存）。
- 编译阶段启用 `lld`（仅链接加速）。
- `EXPORT_FAST=1` → Mac 上 JOBS=2；`SKIP_BUILD=1` → 只导出已有镜像。
- 二次构建依赖已有 BuildKit cargo/npm cache（勿随意 `builder prune`）。

### 使用
```bash
EXPORT_FAST=1 ./export-images.sh   # Mac 提速（内存够时）
SKIP_BUILD=1 ./export-images.sh    # 已有镜像只打 tar
# 正式发版：CI 构建推送 → 服务器 pull（本机最省时间）
```

---

## 2026-07-21 — Mac 导出修复：`no such service: 1` + OOM 加固

### 根因
- `docker compose build --parallel 1` 在 Compose v5 无效：`--parallel` 不是 build 选项，`1` 被当成服务名 → `no such service: 1`。
- 另：Mac Desktop ~8GB 时 `JOBS=2` 易 OOM（与架构无关）。

### 改动
- 导出/推送改为显式串行：`docker compose build backend` → `frontend`（Mac/Windows 一致）。
- Mac 默认 `CARGO_BUILD_JOBS=1`；Windows 默认 2；交叉架构强制 1 + 关 Cargo cache。
- Dockerfile / compose 安全默认 jobs=1。

### 使用
```bash
./export-images.sh                    # Mac：选 linux/arm64；JOBS=1；串行构建
CARGO_BUILD_JOBS=2 ./export-images.sh # Desktop 内存 ≥12GB 时可试
.\export-images.ps1                   # Windows 默认 JOBS=2；OOM 时 $env:CARGO_BUILD_JOBS=1
```

---

## 2026-07-20 — Docker 镜像构建降内存 / 提速（Mac·Windows·Linux）

### 根因
- `codegen-units=1` 推高 LLVM 峰值，Docker Desktop 易 OOM；无 BuildKit cache 导致反复全量编译。
- `Cargo.lock` 曾被 dockerignore 误排除；导出脚本 Darwin 分支缺 `fi`。
- 复查补修：跨架构 cache 未按 `TARGETARCH` 隔离（amd64/arm64 可能串缓存）；`set -e` 下无效的 `$?` 检查。

### 改动
- `backend/Dockerfile`：按架构隔离 BuildKit cache、`CARGO_BUILD_JOBS`；运行时仍 debian bullseye。
- `frontend/Dockerfile`：`npm ci` + npm cache；nginx 不变。
- `Cargo.toml` release：`opt-level=3`、`codegen-units=16`。
- 导出/推送脚本内联 BuildKit、平台与 jobs；交叉架构强制 jobs=1。

### 使用
```bash
./export-images.sh
DOCKER_DEFAULT_PLATFORM=linux/arm64 ./export-images.sh
.\export-images.ps1
```
勿用 Mac 本机二进制替代镜像内程序；导入与 `docker compose up -d` 不变。

---

## 2026-07-20 — 系统概览性能优化

- 实时吞吐轮询 2s → 5s；`/metrics/live` 鉴权仅校验 JWT，跳过 `is_active` 查库
- 去掉日期快捷「全部」；RangePicker 不可清空（避免无界全表聚合）
- `dashboard_cache` 后台每 5 分钟清理超过 30 分钟的缓存条目

## 2026-07-20 — 系统概览仪表盘布局精简

- 请求数与总令牌合并为一张卡片；QPS / RPM / TPM / Task 合并为一张「实时吞吐」卡片
- 消耗 Token、预估成本卡片保持不变；去掉原先独立的 4 格实时吞吐行

## 2026-07-20 — 系统概览默认展示今日数据

- 控制台「系统概览」打开时，日期快捷选项与区间默认从「本月」改为「今日」。

## 2026-07-20 — Dashboard 实时吞吐观测（QPS/RPM/TPM/Task）

- **能力**：系统概览页顶部新增实时吞吐条（QPS / RPM / TPM / Task）；Admin 看全局，普通用户看本人所有 API Key 汇总
- **后端**：`middleware/live_metrics.rs`（static 原子全局 + DashMap 按 token 分槽 + 双 RAII Guard）；埋点在 `api_key_middleware`、`record_and_bill_inner` 与异步 `execute_settlement_tx`；`GET /api/v1/metrics/live`；冷用户 1h TTL / 5min 清理
- **约束**：P0 仅观测不限流；热路径无 Mutex；不写库
- **前端**：`Dashboard.tsx` 独立实时条，2s 轮询，页面隐藏时暂停

---

## 2026-07-20 — dev 启动支持后台 / 前台日志双模式

### 改动
- `dev.sh` / `dev.ps1`：默认 **后台**；`fg` / `DEV_ATTACH=1` 为 **前台日志**（Ctrl+C 仅停本实例）。
- 精简：去掉 `DEV_FAST` 预起二进制分支，统一 `cargo watch -x run`；复用 `port_in_use` / `follow_log`。
- 用法：`./dev.sh [1|2] [bg|fg]`、`.\dev.ps1 [1|2] [bg|fg]`。

### 使用
```bash
./dev.sh                 # 后台（默认）
./dev.sh fg              # 前台日志
.\dev.ps1                # 后台（默认）
.\dev.ps1 1 fg           # 前台日志
```

---

## 2026-07-20 — 加快本地开发启动（兼容多实例 / Windows）

### 改动
- `backend/Cargo.toml`：`[profile.dev]` 使用 `debug = "line-tables-only"`，缩短链接耗时（不影响 release / 业务逻辑）。
- `dev.sh` / `dev.ps1`：统一 `cargo watch -x run`；去掉易出端口冲突的「预起二进制 + postpone」快启分支，增量交给 Cargo。
- 多实例：仍按路径哈希隔离 state、端口避让、只回收本仓库进程；各 checkout 默认各自 `target`（Windows 非 ASCII 路径仍重定向到 `%LOCALAPPDATA%`）。

---

## 2026-07-20 — 对齐半开日期边界与前端绝对时刻传参

### 改动
- 后端：`parse_instant_bound` / `parse_timestamptz_bind` / `push_timestamptz_bound`，纯日期与无偏移时刻按 timedisplay 半开；终点 `< ?::timestamptz`。
- 修复：无偏移 `YYYY-MM-DD HH:mm:ss` 不再被误当成纯日期截断到 00:00。
- 前端：`dateRangeParams.ts`；管理端 usage-stats 同步也改传 ISO。
- 精简：去掉未用 `AbsoluteRange` / coarse 二元组 / `sql_timezone_convert` / 废弃上海边界函数；删除 `date_helper` / `time_system` 内单元测试样例；前端日期传参统一走 `dateRangeParams`（含 AdvancedMarketing / Settings）。
- 修复：日志详情 `get_log_detail` 对非管理员补齐级联脱敏（列表大字段本为 NULL，原先 sanitize 无效）；`dateRangeParams` 拦截 Invalid Date；去掉未接线的 `time_system/package` 与死代码。

---

## 2026-07-20 — 恢复 dev.sh 多实例兼容

### 改动
- `dev.sh`：保留「后台拉起、就绪退出」体验；按目录名设 `PROJECT_NAME`；复用已运行 Postgres；前后端端口占用时顺延；仅清理本仓库残留进程，不误杀其它目录实例。
- 等待就绪改为最长 600s，并每 15s 打印编译进度，避免首次重编译被误判为卡死。

### 使用
```bash
./dev.sh          # 本地后台（默认）
./dev.sh 2        # Docker 全容器
# 可选：PROJECT_NAME / BACKEND_PORT / FRONTEND_PORT / POSTGRES_PORT / DEV_WAIT_MAX
```

---

## 2026-07-20 — 创作中心时间存储与展示全量核对

### 结论
创作中心库表时间列已在 `timestamptz_unify_v1` 覆盖（`playground_projects` / `playground_assets` / `user_model_configs`）；API 读写用 `DbTs` + `NOW()` / `?::timestamptz`。本次补齐前端展示与画布 JSON 时间一致性，以及清理任务的时间解析。

### 后端
- `list_projects` / `get_project` / assets / `user_model_configs`：`created_at`/`updated_at` 用 `DbTs` 解码（避免 TIMESTAMPTZ→String 崩溃）
- `cleanup_stale_playground_nodes`：画布 `created_at` 用 `parse_flexible_ts`；日志匹配绑定 `DbTs` + `?::timestamptz`

### 前端
- 统一经 `parseApiTimeAsUtc` / `formatApiDateTime`（timedisplay）：项目列表、悬浮头、创作日志、资源管理、节点详情、Token 弹窗
- 画布 `taskData.completed_at` 由毫秒时间戳改为 ISO 字符串，与 `created_at` 一致
- 资产回填/超时判定按 UTC 解析，不再依赖浏览器本地 `new Date(无偏移字符串)`

### 部署
前后端同步发布；后端需重启。无新迁移。

---

## 2026-07-20 — 复查：补修 playground TIMESTAMPTZ 解码为 String

### 问题
日志：`decoding column 7: String not compatible with TIMESTAMPTZ`。
创作中心项目列表 SQL 第 7 列是 `created_at`，却用元组 `String` 解码。

### 改动
`playground.rs`：`list_projects` / `get_project` / assets / `user_model_configs` 改为 `DbTs`。

### 部署
重启后端生效。

---

## 2026-07-20 — README 精简与约定补齐

### 改动
- 重写根目录 `README.md`：去掉重复营销与过时章节，保留部署 / 开发 / 运维要点
- 修正管理员默认密码表述不一致；补齐金额 6 位小数、TIMESTAMPTZ、日志归档约定
- 变更历史仍以本文件为准，README 仅作入口链接

### 同步小修
- 渠道配置额度展示、公告低余额阈值输入改为 6 位小数
- `money::format_money` 供通知等格式化复用，消除未使用常量告警

---

## 2026-07-20 — 金额精度统一为小数点后 6 位

### 约定
站点内部账本（日志 cost、扣费结算、余额/赠送金/信控、充值调账、额度用量）一律保留 **6 位小数**（四舍五入）。
支付通道对外法币金额（微信/支付宝等）仍按通道要求保留 2 位，不在此范围。

### 改动
- 后端新增 `money::round_money`，接入余额 API、管理员充值、计费结算、预扣拆分、额度微单位
- 前端日志/财务/钱包/用户/令牌/渠道/仪表盘等金额展示统一 `toFixed(6)` / `precision={6}`
- 前端金额展示统一 `toFixed(6)` / `precision={6}`（与后端 `money::round_money` 对齐）

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
- `ForgotPassword` / `Register`：`useRef` 同步锁 + `cooldownUntilRef` 时间戳冷却，堵住 state 提交竞态。
- 成功冷却 60s；失败短冷却 3s；切换找回方式不再清零倒计时。
- 请求中禁用按钮并显示 loading。
- 后端已有 `check_code_send_cooldown`（60s），前端防刷主要解决弹窗刷屏。

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

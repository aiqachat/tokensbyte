# TokensByte — LLM API 网关

Rust + React 构建的高性能大模型 API 分发与管理平台：统一接入、计费、限流、审计。

> **数据库**：仅支持 **PostgreSQL 16+**（Compose 内置 **18.4-alpine**）。不兼容 MySQL / SQLite。整数 ID 统一 `BIGINT`（Rust `i64`）。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [快速部署](#快速部署)
- [使用入门](#使用入门)
- [本地开发](#本地开发)
- [约定与运维要点](#约定与运维要点)
- [常见问题](#常见问题)
- [贡献与许可](#贡献与许可)

---

## 功能概览

| 能力 | 说明 |
|------|------|
| 统一接入 | OpenAI 兼容接口；文本 / 图像 / 视频 / 嵌入等多模态 |
| 路由与 HA | 渠道权重、转发规则、故障转移、限流熔断 |
| 计费与钱包 | 规则计费、预扣结算、系统/赠送/信控钱包、充值支付 |
| 安全 | JWT、Admin/User 双端隔离、API Key、操作审计 |
| 运营 | 仪表盘、日志/任务、财务统计、插件扩展 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Rust · Axum · Tokio · SQLx (PostgreSQL only) |
| 前端 | React 19 · TypeScript · Ant Design 6 · Tailwind 4 · Zustand · Vite |
| 部署 | Docker Compose · Nginx · PostgreSQL 18.4 |

```
客户端 / SDK  ──▶  API 网关(鉴权/限流/路由)  ──▶  上游模型
管理后台      ──▶  业务层(配额/计费/统计)    ──▶  PostgreSQL
```

---

## 快速部署

**环境**：Docker 20.10+、Compose 2.x；建议 4C / 8G / 50GB。

### 1）一键启动

```bash
git clone <repository-url>
cd tokensbyte
docker compose up -d --build
```

- 前台：`http://localhost:8080`
- 管理端：`http://localhost:8080/admin1688`
- 默认管理员：`admin` / `admin`（可用环境变量 `ADMIN_PASSWORD` 覆盖；未设置时可能写入 `data/.admin_password`）

生产请务必修改 `.env` 中的数据库密码、JWT 密钥与管理员密码。

### 2）交互式部署（推荐）

```bash
chmod +x deploy.sh && ./deploy.sh
```

引导生成 DB 密码、JWT、管理员密码，并可选开发/生产模式。

### 3）自定义 / 外部数据库

```bash
cp .env.example .env   # 按注释修改
docker compose up -d
```

使用外部 PostgreSQL：改 `DATABASE_URL`，并在 `docker-compose.yml` 中停用内置 `postgres` 服务。

### 模式对照

| 配置 | 场景 |
|------|------|
| `docker-compose.yml` | 生产 / 测试 |
| `+ docker-compose.dev.yml` | 容器内热重载开发 |
| `dev.sh` / `dev.ps1` | 本机前后端热重载（共用 Docker Postgres） |
| `dev-os.sh` | 开源版本地启动 |

离线镜像导出：`./export-images.sh`（Windows：`.\export-images.ps1`）。Apple Silicon **不建议本机打 `linux/amd64`**（QEMU 跑 rustc 易 segfault）；M 系列请优先 `linux/arm64`，x86 云请在 Linux/CI 导出 amd64。

打包提速（不影响线上运行时逻辑）：同架构 + 保留 BuildKit cache；Mac 可 `EXPORT_FAST=1 ./export-images.sh`（需 Desktop ≥12GB）；仅重新打 tar 用 `SKIP_BUILD=1`；正式发版优先 CI 推镜像后服务器 `pull`。

---

## 使用入门

1. 登录管理端 → 配置渠道与模型  
2. 用户端创建 API 令牌并设置额度  
3. 业务侧将 Base URL 指向网关 `/v1`，使用令牌调用  

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'
```

健康检查：`GET /api/health`。

常用管理 API 前缀：`/api/v1/auth`、`/users`、`/channels`、`/models`、`/tokens`、`/finance`、`/logs`、`/settings`。

---

## 本地开发

```bash
# 推荐：一键（默认后台；自动起/复用 Postgres；端口占用时顺延；多 checkout 可并行）
./dev.sh              # Linux/Mac 后台
./dev.sh fg           # Linux/Mac 前台看日志（Ctrl+C 停本实例）
.\dev.ps1             # Windows 后台
.\dev.ps1 1 fg        # Windows 前台看日志
```

可选环境变量：`BACKEND_PORT` / `FRONTEND_PORT` / `POSTGRES_PORT` / `DEV_WAIT_MAX` / `DEV_ATTACH=1`（前台日志）。增量编译由 Cargo 自身处理；`[profile.dev]` 已优化本地链接耗时。

原生方式：

```bash
# 后端
cd backend && cp .env.example .env
APP_ENV=development cargo run   # 开发秒退，跳过计费 drain

# 前端
cd frontend && npm install && npm run dev
# http://localhost:5173 → 代理到后端 :3000
```

**黄金三步（Rust CI）**：`cargo fmt --all` → `cargo clippy --all-targets --all-features -- -D warnings` → `cargo test --all-targets --all-features`。

### 目录结构（精简）

```
tokensbyte/
├── backend/src/     # api · relay · db · services · money …
├── frontend/src/    # pages · components · store · utils
├── docker-compose.yml
├── docker-compose.dev.yml
├── deploy.sh · dev.sh · export-images.sh
├── README.md · CHANGELOG.md
└── data/            # 持久化（本地）
```

---

## 约定与运维要点

### 金额精度

站点内部账本（日志 `cost`、扣费结算、余额 / 赠送金 / 信控、充值调账、额度）统一 **小数点后 6 位**（四舍五入）。

- 后端：`backend/src/money.rs` → `round_money` / `format_money`
- 前端：展示层统一 `toFixed(6)` / `precision={6}`（与后端 6 位账本对齐）
- **例外**：微信 / 支付宝等支付通道对外法币仍按通道要求（通常 2 位）

### 时间与日志

- 业务时间列统一 `TIMESTAMPTZ`；范围查询使用 `?::timestamptz`
- 日志详情清理：`storage_settings.log_retention_days`（默认 30）
- 冷归档：`storage_settings.log_row_retention_days`（默认 0=关闭）→ `logs_archive`

### 常用 Compose 命令

```bash
docker compose up -d          # 启动
docker compose ps             # 状态
docker compose logs -f backend
docker compose down           # 停止（加 -v 会删数据卷）
docker compose up -d --build  # 重建
```

变更历史见 [CHANGELOG.md](CHANGELOG.md)。

---

## 常见问题

**只支持哪些数据库？**  
仅 PostgreSQL。勿把 `DATABASE_URL` 指到其他引擎。

**内置库还是外部库？**  
开发 / 小规模 Linux 生产可用 Compose 内置；Windows/Mac 生产或大数据量建议外部 RDS / 独立安装。

**如何备份？**  
`pg_dump` / `pg_restore`。应用启动会自动跑增量迁移。

**默认管理员密码对不上？**  
Compose / `.env` 以 `ADMIN_PASSWORD` 为准；文档与示例默认为 `admin`。本地 Vite 开发若另行初始化，以控制台或 `data/.admin_password` 为准。

---

## 贡献与许可

1. Fork → 特性分支 → PR  
2. Rust：`fmt` + `clippy -D warnings` + `test`；前端遵循 ESLint  
3. 提交信息建议：`type(scope): description`

许可证：[MIT](LICENSE)

问题反馈：GitHub Issues  
变更记录：[CHANGELOG.md](CHANGELOG.md)

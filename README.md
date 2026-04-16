# TokensByte — 下一代大语言模型 (LLM) API 网关

基于 Rust + React 构建的高性能 LLM API 分发与管理平台。

## 🚀 核心特性

- **极致性能**：基于 Rust、Axum 和 Tokio 构建的超高性能后端。
- **统一接口**：兼容 OpenAI 标准接口，支持国内外主流大模型。
- **端级隔离**：全新设计的双端架构。默认路径为用户端，提供精简的令牌管理；系统后台隐藏在特定路径下，确保安全。
- **多语言支持 (i18n)**：完整支持 **简体中文** 与 **英文**，适配国际化使用场景。
- **硬核管理后台**：专为系统管理员打造的极客风后台（`/admin0755`），轻松管理渠道、用户和兑换码。
- **企业级支持**：支持多租户、配额管理和细粒度的权限控制。
- **容器化部署**：支持 Docker Compose 一键部署。

## 🚀 站点说明
- **渠道分组AID**：AID 为渠道分组的唯一标识。
- **用户UID**：用户唯一标识。


## 📦 服务部署指南

本项目支持多种部署方式，满足从本地测试到企业生产的各类需求。所有容器化配置文件均已内置。

### 方式一：快速起步（本地/测试环境）
使用 SQLite 和基础配置，最快体验全功能：
```bash
git clone <repository-url>
cd tokensbyte
docker-compose up -d
```
> [!NOTE]
> 成功启动后，浏览器访问 `http://localhost:5173/admin0755`。默认超管账号：`admin` / `123456`（请在控制台及时修改）。

### 方式二：标准生产环境部署（推荐）
针对生产环境，推荐挂载外部 PostgreSQL 并开启生产环境构建：

1. **初始化配置**：
   ```bash
   cp .env.example .env
   # 根据注释修改 .env 中的 DATABASE_URL、JWT 密钥等安全项
   ```
2. **使用专用的生产 Compose 文件启动**（详情参阅内置的 [`docker-compose.prod.yml`](docker-compose.prod.yml)）：
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### 方式三：离线/云端加速部署（针对国内慢速网络）
如果您在云服务器上的构建速度过慢，我们在工程中自带了一键导出/导入脚本：
1. **本地打包**：Windows 运行 `.\export-images.ps1`（Mac/Linux 运行 `./export-images.sh`）。
2. **上传并在服务器激活**：将生成的 `docker-images` 文件夹丢到服务器运行 `./import-images.sh`。
📖 详细操作请参阅专业文档：[`EXPORT-IMAGES-GUIDE.md`](EXPORT-IMAGES-GUIDE.md)。

### 4. 使用 API
配置您的 OpenAI SDK：
- **Base URL**: `http://localhost:3000`
- **API Key**: `sk-xxxx` (在 TokensByte 后台生成)

## 🛠️ 开发环境搭建

### 后端 (Backend)

后端采用 Rust 开发，配置管理遵循 **环境变量优先** 原则（配置优先级：系统环境变量 > `.env` 文件 > 内置默认值）。

1. **配置文件加载**：
   ```bash
   cd backend
   cp .env.example .env  # Windows使用 copy .env.example .env
   # 根据注释修改 .env （可参考内置的 .env.example 文件）
   ```

2. **运行（推荐：全自动热重载开发模式）**：
   如果你在 Windows 等非原生 Linux 环境下开发，每次修改 Rust 会面临锁文件或编译缓慢的问题。我们提供了基于 Docker + `cargo-watch` 的**零配置热重载开发环境**：
   
   只需在工程根目录执行（一次性拉起前后端与数据库）：
   ```powershell
   .\dev.ps1
   ```
   *保存任意 `backend/src/*.rs` 文件，后端即会在容器内秒级自动增量编译并热重载。`target` 缓存亦通过专用 Volume 隔离，不污染宿主机。*

3. **运行（传统原生单机模式）**：
   需要你本地已安装完整的 Rust 环境。
   ```bash
   cargo run
   # 或构建生产版本: cargo build --release
   ```

### 前端 (Frontend)

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（带热重载）
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

**前端开发服务器：**
- 默认地址：http://localhost:5173
- 自动代理 API 请求到后端 http://localhost:3000

**默认管理员账号**：
- **用户名**：`admin`
- **密码**：`123456`

## 🏗️ 技术栈

### 后端
- **语言**：Rust 1.70+
- **框架**：Axum (Web 框架)
- **异步运行时**：Tokio
- **数据库**：SQLx (支持 SQLite / PostgreSQL)
- **认证**：JWT (jsonwebtoken)

### 前端
- **框架**：React 18 + TypeScript
- **UI 库**：Ant Design 5
- **国际化**：i18next
- **状态管理**：Zustand
- **构建工具**：Vite
- **路由**：React Router v6

### 部署
- **容器化**：Docker + Docker Compose
- **反向代理**：Nginx
- **数据库**：PostgreSQL 14+ (生产推荐) / SQLite (开发测试)

## 📁 项目结构

```
tokensbyte/
├── backend/                 # Rust 后端
│   ├── src/
│   │   ├── api/            # API 路由处理
│   │   ├── auth/           # 认证中间件
│   │   ├── db/             # 数据库连接与迁移
│   │   ├── middleware/     # 中间件（限流等）
│   │   ├── models/         # 数据模型
│   │   ├── monitor/        # 健康检查
│   │   ├── providers/      # 第三方服务集成
│   │   ├── relay/          # API 转发逻辑
│   │   ├── services/       # 业务逻辑服务
│   │   ├── config.rs       # 配置管理
│   │   ├── error.rs        # 错误处理
│   │   └── main.rs         # 应用入口
│   ├── Cargo.toml          # Rust 依赖
│   └── Dockerfile          # 后端 Docker 配置
│
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/     # 可复用组件
│   │   ├── layouts/        # 页面布局
│   │   ├── locales/        # 国际化文件
│   │   ├── pages/          # 页面组件
│   │   ├── store/          # 状态管理
│   │   ├── types/          # TypeScript 类型定义
│   │   ├── utils/          # 工具函数
│   │   ├── App.tsx         # 应用根组件
│   │   ├── i18n.ts         # 国际化配置
│   │   └── main.tsx        # 应用入口
│   ├── package.json        # Node.js 依赖
│   ├── vite.config.ts      # Vite 配置
│   └── Dockerfile          # 前端 Docker 配置
│
├── docker-compose.yml      # Docker Compose 配置（开发）
├── README.md               # 项目文档
└── data/                   # 数据持久化目录
```

### 其他端点

- `POST /v1/chat/completions` - 聊天补全（支持流式）
- `POST /v1/completions` - 文本补全
- `POST /v1/embeddings` - 嵌入向量
- `POST /v1/images/generations` - 图像生成
- `GET /v1/models` - 获取可用模型列表

### 管理后台 API

所有管理页面 API 位于 `/api/v1` 路径下，需要管理员 JWT token 认证。

## 🔧 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 代码规范

- **Rust**：遵循 `cargo fmt` 和 `clippy` 建议
- **TypeScript**：遵循 ESLint 规则
- **提交信息**：使用语义化提交信息

## ❓ 常见问题

### Q: 如何指定使用 PostgreSQL 还是 SQLite？

A: 系统底部驱动 `sqlx` 会严格根据环境变量 `DATABASE_URL` 的**协议前缀**自动判断并切换底层数据库引擎，完全无需调整代码或装依赖：
- **使用 PostgreSQL（推荐生产）**：
  在 `.env` 或系统中配置 `DATABASE_URL=postgres://user:password@host:port/dbname`
- **使用 SQLite（推荐本地开发测试）**：
  在 `.env` 或系统中配置 `DATABASE_URL=sqlite://data/tokensbyte.db`

*注：在 `docker-compose.prod.yml` 中默认预配置的正是 PostgreSQL 环境。如果没有显式声明该变量，系统也会默认尝试连接本地默认的 PG 实例。*

### Q: 支持哪些模型？

A: 支持 OpenAI、Anthropic、Google、火山引擎等主流大模型提供商，具体取决于您的渠道配置。

### Q: 如何迁移数据？

A: 如果使用 PostgreSQL，可以使用 `pg_dump` 和 `pg_restore` 工具。SQLite 数据可以使用提供的迁移脚本转换。

### Q: 性能如何？

A: 基于 Rust + Tokio 构建，单实例可处理数千并发请求。实际性能取决于服务器配置和上游响应速度。

### Q: 如何监控服务状态？

A: 访问 `/health` 端点查看健康状态，或查看日志：
```bash
docker compose logs -f
```

## 📝 更新日志

查看 [UPDATE.md](UPDATE.md) 了解最新的版本更新和变更记录。

## 🛡️ 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 联系方式

- 项目问题：[GitHub Issues](https://github.com/your-org/tokensbyte/issues)
- 邮箱：your-email@example.com


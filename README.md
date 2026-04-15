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


## 📦 Docker 部署指南

### 方式三：本地打包镜像 + 云服务器部署（推荐用于慢速服务器）

如果云服务器打包速度慢，可以在本地构建好镜像后上传到服务器：

**快速三步走：**
```bash
# 1. 本地导出镜像
./export-images.sh  # Linux/Mac
.\export-images.ps1  # Windows

# 2. 上传到服务器
scp docker-images/*.tar root@server:/opt/tokensbyte/

# 3. 服务器导入部署
ssh root@server
cd /opt/tokensbyte
./import-images.sh
docker compose -f docker-compose.prod.yml up -d
```

📖 **详细说明**：查看 [EXPORT-IMAGES-GUIDE.md](EXPORT-IMAGES-GUIDE.md)

#### 1. 本地构建并导出镜像

**Linux/Mac:**
```bash
# 运行导出脚本
chmod +x export-images.sh
./export-images.sh
```

**Windows:**
```powershell
# 运行导出脚本
.\export-images.ps1
```

脚本会：
- 自动构建 Docker 镜像
- 导出为 `.tar` 文件到 `docker-images/` 目录
- 生成导入脚本和上传指南

#### 2. 上传到云服务器

参考生成的 `docker-images/UPLOAD-GUIDE.txt` 文件，使用以下任一方法：

**方法一：使用 scp**
```bash
# Linux/Mac
scp docker-images/*.tar your-user@your-server:/opt/tokensbyte/
scp docker-images/import-images.sh your-user@your-server:/opt/tokensbyte/
scp docker-compose.prod.yml your-user@your-server:/opt/tokensbyte/

# Windows PowerShell
scp .\docker-images\*.tar your-user@your-server:/opt/tokensbyte/
scp .\docker-images\import-images.ps1 your-user@your-server:/opt/tokensbyte/
scp docker-compose.prod.yml your-user@your-server:/opt/tokensbyte/
```

**方法二：使用 WinSCP（Windows 推荐）**
1. 下载 WinSCP: https://winscp.net
2. 连接到服务器
3. 上传 `docker-images/` 目录下的所有文件

**方法三：使用云存储（大文件推荐）**
```bash
# 压缩文件
# Linux/Mac
cd docker-images
tar -czf tokensbyte-images.tar.gz *.tar

# Windows PowerShell
Compress-Archive -Path ".\docker-images\*.tar" -DestinationPath ".\docker-images\tokensbyte-images.zip"
```

#### 3. 在服务器导入并部署

```bash
# SSH 登录服务器
ssh your-user@your-server

# 进入部署目录
cd /opt/tokensbyte

# 导入镜像
chmod +x import-images.sh
./import-images.sh

# 创建环境变量
cp .env.example .env
nano .env  # 编辑配置

# 启动服务
docker compose -f docker-compose.prod.yml up -d

# 查看状态
docker compose -f docker-compose.prod.yml ps
```

### 方式一：快速部署（开发/测试环境）

适用于本地开发和测试，使用内置 SQLite 数据库：

```bash
# 1. 克隆项目
git clone <repository-url>
cd tokensbyte

# 2. 一键启动
docker compose up -d

# 3. 查看日志
docker compose logs -f
```

**访问地址：**
- 用户端：http://localhost:5173
- 管理后台：http://localhost:5173/admin0755
- API 接口：http://localhost:3000/v1

**默认管理员账号：**
- 用户名：`admin`
- 密码：`admin`

### 方式二：生产环境部署（推荐）

生产环境建议使用 PostgreSQL 数据库，需要创建自定义配置文件：

#### 1. 创建环境变量文件

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库配置（PostgreSQL）
DATABASE_URL=postgres://tokensbyte:your_secure_password@postgres:5432/tokensbyte
POSTGRES_PASSWORD=your_secure_password

# JWT 密钥（生产环境必须修改）
JWT_SECRET=your-secret-key-change-me-in-production

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password

# 端口配置
BACKEND_PORT=3000
FRONTEND_PORT=5173

# 功能开关
REGISTER_ENABLED=true
```

#### 2. 创建生产环境 Docker Compose 配置

创建 `docker-compose.prod.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: tokensbyte-postgres
    environment:
      - POSTGRES_DB=tokensbyte
      - POSTGRES_USER=tokensbyte
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tokensbyte"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: tokensbyte-backend
    environment:
      - HOST=0.0.0.0
      - PORT=3000
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_USERNAME=${ADMIN_USERNAME}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - REGISTER_ENABLED=${REGISTER_ENABLED}
    volumes:
      - ./data:/data
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: tokensbyte-frontend
    ports:
      - "${FRONTEND_PORT:-5173}:80"
    depends_on:
      - backend
    restart: always

volumes:
  postgres_data:
```

#### 3. 启动服务

```bash
# 使用生产配置启动
docker compose -f docker-compose.prod.yml up -d

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

### HTTPS 部署（使用 Nginx 反向代理）

生产环境推荐使用 HTTPS，配置外部 Nginx 反向代理：

#### 1. Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端静态资源
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 后端 API
    location /v1 {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE 流式响应支持
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    # 管理后台 API
    location /api/v1 {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

#### 2. 关键配置说明

**协议透传**：通过 `X-Forwarded-Proto` 头，后端可以识别原始请求是 HTTP 还是 HTTPS。

**流式响应**：代理配置中禁用了 buffering 和 cache，确保 SSE 流式响应正常工作。

### 部署架构

```
┌─────────────────────────────────────────┐
│         外部 Nginx (HTTPS)              │
│  处理 SSL 终结，转发到 Docker 容器      │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌────────┐      ┌──────────┐
│前端    │      │后端      │
│:5173   │      │:3000     │
│Nginx   │      │Rust/Axum │
└────────┘      └────┬─────┘
                     │
                     ▼
              ┌──────────┐
              │PostgreSQL│
              │:5432     │
              └──────────┘
```

### 常用运维命令

```bash
# 停止服务
docker compose down

# 停止并删除数据卷（谨慎使用）
docker compose down -v

# 重新构建并启动
docker compose up -d --build

# 查看容器日志
docker compose logs -f backend
docker compose logs -f frontend

# 进入容器
docker exec -it tokensbyte-backend sh
docker exec -it tokensbyte-frontend sh

# 数据库备份（PostgreSQL）
docker exec tokensbyte-postgres pg_dump -U tokensbyte tokensbyte > backup.sql

# 数据库恢复
docker exec -i tokensbyte-postgres psql -U tokensbyte tokensbyte < backup.sql

# 查看资源使用
docker stats
```

### 故障排查

#### 1. 后端启动失败

```bash
# 查看后端日志
docker compose logs backend

# 常见问题：
# - 数据库连接失败：检查 DATABASE_URL 和 PostgreSQL 是否正常运行
# - 端口被占用：修改 BACKEND_PORT 或停止占用端口的服务
```

#### 2. 前端无法访问后端

```bash
# 检查容器网络
docker compose ps

# 测试后端连通性
docker exec tokensbyte-frontend curl http://backend:3000/health
```

#### 3. 数据库连接问题

```bash
# 检查 PostgreSQL 状态
docker compose ps postgres

# 查看 PostgreSQL 日志
docker compose logs postgres

# 测试数据库连接
docker exec tokensbyte-postgres psql -U tokensbyte -d tokensbyte -c "SELECT 1"
```

#### 4. 重新构建镜像

```bash
# 清理旧镜像
docker compose down

# 清除构建缓存
docker builder prune

# 重新构建
docker compose build --no-cache
docker compose up -d
```

### 安全建议

1. **修改默认密码**：生产环境必须修改 `ADMIN_PASSWORD` 和 `JWT_SECRET`
2. **使用 HTTPS**：通过 Nginx 配置 SSL 证书
3. **数据库安全**：PostgreSQL 仅暴露给 Docker 内部网络，不要公开端口
4. **定期备份**：设置定时任务备份数据库
5. **限制注册**：生产环境建议设置 `REGISTER_ENABLED=false`
6. **防火墙配置**：仅开放必要端口（80/443）

### 数据持久化

Docker 部署时，以下数据会被持久化：

- **PostgreSQL 数据**：存储在 `postgres_data` 卷中
- **后端文件**：`./data` 目录映射到容器内 `/data`
- **SQLite 数据库**（如果使用）：存储在 `./data` 目录

---

## 🚀 快速开始（本地开发）

## 🛠️ 开发环境搭建

### 后端 (Backend)

```bash
cd backend

# 配置环境变量（如需要）
# Windows
copy .env.example .env
# Linux/Mac
cp .env.example .env

# 运行开发服务器
cargo run

# 或者构建 release 版本
cargo build --release
./target/release/tokensbyte-server
```

**后端环境变量示例 (.env)：**
```env
HOST=127.0.0.1
PORT=3000
DATABASE_URL=sqlite://data/tokensbyte.db
# 或使用 PostgreSQL
# DATABASE_URL=postgres://user:password@localhost:5432/tokensbyte
JWT_SECRET=your-jwt-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
REGISTER_ENABLED=true
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

## 📖 API 文档

TokensByte 兼容 OpenAI API 标准，您可以使用任何 OpenAI 兼容的 SDK 或工具。

### 聊天补全

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

### 其他端点

- `POST /v1/chat/completions` - 聊天补全（支持流式）
- `POST /v1/completions` - 文本补全
- `POST /v1/embeddings` - 嵌入向量
- `POST /v1/images/generations` - 图像生成
- `GET /v1/models` - 获取可用模型列表

### 管理后台 API

所有管理 API 位于 `/api/v1` 路径下，需要管理员 JWT token 认证。

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


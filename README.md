# TokensByte — 下一代大语言模型 (LLM) API 网关

基于 Rust + React 构建的高性能 LLM API 分发与管理平台，为企业和开发者提供统一、安全、高效的大模型接入和管理解决方案。

---

## 📋 目录

- [项目概述](#-项目概述)
- [核心功能与特性](#-核心功能与特性)
- [技术架构与栈](#-技术架构与栈)
- [安装与配置指南](#-安装与配置指南)
- [使用说明](#-使用说明)
- [主要模块说明](#-主要模块说明)
- [API 文档](#-api-文档)
- [开发指南](#-开发指南)
- [常见问题解答](#-常见问题解答)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

## 🎯 项目概述

TokensByte 是一款面向企业级应用的 LLM API 网关，致力于解决多模型接入、流量管控、成本优化、安全审计等痛点问题。通过提供统一的 OpenAI 兼容接口，开发者无需修改业务代码即可快速切换不同大模型提供商，大幅降低集成和维护成本。

### 适用场景

- **企业 AI 中台**：统一管理企业内部所有大模型调用，实现权限控制、流量监控和成本分摊
- **SaaS 服务提供商**：为客户提供多模型支持，降低接入成本，提高服务稳定性
- **AI 应用开发者**：快速集成多种大模型能力，专注于业务逻辑开发
- **研究机构**：统一管理大模型调用配额，实现团队资源共享和成本管控

### 核心价值

- **降低集成成本**：一次集成即可使用所有主流大模型能力
- **提高服务稳定性**：智能负载均衡和故障转移，保障服务高可用
- **优化使用成本**：动态路由到性价比最高的模型，降低整体调用成本
- **增强安全合规**：完整的调用日志和审计能力，满足数据安全和合规要求
- **精细化运营**：多维度数据统计和分析，助力业务决策

---

## 🚀 核心功能与特性

### 核心功能

1. **多模型统一接入**
   - 兼容 OpenAI 标准接口，无需修改业务代码
   - 支持 OpenAI、Anthropic、Google、火山引擎等国内外主流大模型
   - 支持文本生成、聊天补全、嵌入向量、图像生成、视频生成等多种能力

2. **流量管控与调度**
   - 智能路由策略，根据模型类型、成本、响应时间自动选择最优渠道
   - 多级限流机制，支持用户级、应用级、渠道级流量控制
   - 故障自动转移，保障服务高可用性
   - 权重负载均衡，实现流量的精细分配

3. **安全与权限管理**
   - 基于 JWT 的身份认证机制
   - 细粒度的 API 密钥权限控制
   - 完整的调用日志和审计追踪
   - 敏感内容检测和过滤能力

4. **成本与配额管理**
   - 多租户架构，支持团队和用户级别的配额管理
   - 灵活的计费规则配置，支持按 token、按次、按时间段等多种计费方式
   - 实时消费统计和预警，避免成本超支
   - 成本分析报表，优化模型使用策略

5. **运营与监控**
   - 可视化管理后台，轻松管理渠道、用户、配额和权限
   - 实时监控大盘，展示系统运行状态和调用 metrics
   - 多维度数据分析，支持按用户、模型、渠道等维度统计
   - 异常告警机制，及时发现和处理问题

### 核心特性

- **极致性能**：基于 Rust、Axum 和 Tokio 构建的超高性能后端，单实例可支持数千并发请求
- **端级隔离**：全新设计的双端架构，用户端和管理后台完全隔离，确保系统安全
- **多语言支持**：完整支持简体中文与英文，适配国际化使用场景
- **容器化部署**：支持 Docker Compose 一键部署，降低运维成本
- **扩展性强**：模块化设计，易于扩展新的模型提供商和功能特性
- **企业级稳定**：经过生产环境验证，支持高并发、高可用的部署要求

---

## 🏗️ 技术架构与栈

### 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   客户端应用    │────▶│   API 网关层    │────▶│   大模型提供商  │
│ (业务系统/SDK)  │     │ (路由/限流/鉴权)│     │ (OpenAI/Anthropic等)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   管理后台      │◀────│   业务逻辑层    │◀────│   数据存储层    │
│ (运营/管理)     │     │ (配额/计费/统计)│     │ (PostgreSQL/Redis)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 技术栈

#### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | 1.70+ | 后端开发语言，提供极致性能和内存安全 |
| Axum | 最新 | Web 框架，高性能异步 HTTP 服务 |
| Tokio | 最新 | 异步运行时，支持高并发处理 |
| SQLx | 最新 | 数据库 ORM，支持 PostgreSQL 和 SQLite |
| jsonwebtoken | 最新 | JWT 认证实现 |
| serde | 最新 | 序列化/反序列化框架 |

#### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | 前端框架 |
| TypeScript | 5.x | 类型安全的 JavaScript 超集 |
| Ant Design | 5.x | UI 组件库 |
| Zustand | 最新 | 轻量级状态管理 |
| React Router | 6.x | 路由管理 |
| i18next | 最新 | 国际化支持 |
| Vite | 最新 | 构建工具，提供极速开发体验 |

#### 部署与运维

| 技术 | 版本 | 用途 |
|------|------|------|
| Docker | 20.10+ | 容器化部署 |
| Docker Compose | 2.x | 多容器编排 |
| Nginx | 1.25+ | 反向代理和静态资源服务 |
| PostgreSQL | 15+ | 主数据库，存储业务数据 |
| GitHub Actions | - | CI/CD 自动化流程 |

---

## 📦 安装与配置指南

### 环境要求

- Docker 20.10+
- Docker Compose 2.0+
- 最低配置：2核 CPU、4GB 内存、20GB 磁盘空间
- 推荐配置：4核 CPU、8GB 内存、50GB 磁盘空间

### 快速部署

#### 方式一：一键启动（最快体验）

无需任何配置，直接运行即可启动全部服务（内置 PostgreSQL + 默认配置）：

```bash
git clone <repository-url>
cd tokensbyte
docker compose up -d --build
```

> [!NOTE]
> 首次部署需要 `--build` 参数构建镜像，后续启动直接 `docker compose up -d` 即可（使用本地已有镜像）。默认配置仅供快速体验，生产环境请通过 `.env` 修改密码等安全项。
>
> 成功启动后，浏览器访问 `http://localhost:8080/admin0755`，默认超管账号：`admin` / `admin`。

#### 方式二：一键交互式部署（推荐新手）

使用内置的部署脚本，自动引导配置环境变量并部署：

```bash
chmod +x deploy.sh
./deploy.sh
```

脚本交互流程：

1. **数据库密码** — 自动生成 16 位强密码（含大小写字母、数字、特殊字符）
2. **JWT 密钥** — 自动生成 64 位随机密钥
3. **管理员密码** — 手动输入（默认: `admin`）
4. **注册开关** — 选择是否允许用户注册

配置完成后选择部署模式：
- **开发环境** — 热重载（cargo-watch + Vite HMR），源码挂载，适合日常开发
- **生产环境** — 内置 PostgreSQL，开箱即用

> [!TIP]
> 如已有 `.env` 文件，脚本会显示当前配置并询问是否重新配置。也可直接编辑 `.env` 后运行 `docker compose up -d`。

#### 方式三：自定义配置部署（推荐生产环境）

通过 `.env` 文件自定义配置，compose 内已提供全部默认值，`.env` 中只需覆盖需要修改的项：

1. **创建配置文件**：
   ```bash
   cp .env.example .env
   # 根据注释修改 .env 中的安全项（密码、JWT 密钥等）
   ```

2. **启动服务**：
   ```bash
   docker compose up -d
   ```

> [!TIP]
> 如需使用外部 PostgreSQL（RDS/云数据库），只需修改 `.env` 中的 `DATABASE_URL` 指向外部数据库，并注释掉 `docker-compose.yml` 中的 `postgres` 服务即可。

#### 方式四：离线/云端加速部署（针对国内慢速网络）

在本地构建镜像并导出，上传到云服务器后导入部署，避免服务器上缓慢的构建过程。

**步骤 1：本地导出镜像**

```bash
# Linux/Mac
chmod +x export-images.sh && ./export-images.sh

# Windows (PowerShell)
.\export-images.ps1
```

**步骤 2：上传到服务器**

```bash
scp docker-images/*.tar root@your-server:/opt/tokensbyte/
scp docker-images/import-images.sh root@your-server:/opt/tokensbyte/
scp docker-compose.yml root@your-server:/opt/tokensbyte/
scp .env.example root@your-server:/opt/tokensbyte/

# 压缩后上传可减小 30-40% 体积
cd docker-images && tar -czf images.tar.gz *.tar
scp images.tar.gz root@your-server:/opt/tokensbyte/
```

**步骤 3：服务器导入并部署**

```bash
ssh root@your-server && cd /opt/tokensbyte
chmod +x import-images.sh && ./import-images.sh
cp .env.example .env && nano .env   # 编辑配置，修改密码等安全项
docker compose up -d
```

> [!NOTE]
> PostgreSQL 是官方镜像，服务器启动时会自动从 Docker Hub 拉取，无需导出。如只需更新某个服务，可单独导出：`docker save -o backend-new.tar tokensbyte-backend:latest`，在服务器 `docker load -i backend-new.tar` 后 `docker compose up -d` 即可。

### 部署模式对比

| 配置文件 | 数据库 | 适用场景 | 特点 |
|---------|--------|---------|------|
| `docker-compose.yml` | 内置 PostgreSQL（可切换外部） | 生产/测试 | 一键启动、首次需 --build 构建镜像，后续使用本地镜像 |
| `docker-compose.yml` + `docker-compose.dev.yml` | 内置 PostgreSQL | 日常开发 | 源码挂载、热重载、增量编译 |

### 数据库部署选择建议

| 维度 | Docker内置 | 独立安装/外部数据库 |
|------|-----------|-------------------|
| **性能（Linux）** | 几乎无损（<2%） | 原生性能 |
| **性能（Windows/Mac）** | I/O损耗 15-40% | 原生性能 |
| **运维复杂度** | 低（一键部署） | 中（需手动管理） |
| **数据备份** | 数据卷备份 | 原生pg_dump工具 |
| **性能调优** | 受限 | 完全可控 |

**推荐策略：**
- ✅ **开发/测试环境**：Docker内置足够用
- ✅ **Linux生产环境**（数据量<50GB）：Docker内置性能损耗可忽略
- ✅ **Windows/Mac生产环境**：建议独立安装或使用云数据库（RDS等）
- ✅ **大规模生产环境**（数据量>100GB）：建议独立安装并深度调优

---

## 📖 使用说明

### 快速开始

1. **登录管理后台**
   - 访问 `http://your-domain/admin0755`
   - 使用管理员账号登录（默认：admin/admin）

2. **配置模型渠道**
   - 进入「渠道管理」页面
   - 添加大模型提供商的 API 密钥和配置
   - 测试渠道连通性

3. **创建 API 密钥**
   - 进入「令牌管理」页面
   - 生成新的 API 密钥
   - 配置密钥的权限和配额

4. **接入业务系统**
   - 使用 OpenAI 兼容的 SDK 或 HTTP 客户端
   - 将 Base URL 设置为 `http://your-domain`
   - 使用生成的 API 密钥即可调用大模型能力

### 使用示例

#### Python 示例

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
)

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

#### JavaScript 示例

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true,
  });
  
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();
```

#### cURL 示例

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## 🧩 主要模块说明

### 1. API 网关层

**核心功能**：负责接收客户端请求，进行身份验证、限流检查、路由转发，以及响应返回。

**关键特性**：
- 完全兼容 OpenAI API 接口规范
- 支持流式响应和非流式响应
- 内置请求校验和参数验证
- 智能路由到最优模型渠道
- 自动故障转移和重试机制

### 2. 用户管理模块

**核心功能**：管理系统用户、权限、角色和组织架构。

**关键特性**：
- 多租户架构，支持团队和子用户管理
- 基于角色的权限控制（RBAC）
- 用户级别配额和限流配置
- 支持邮箱、手机号、OAuth 等多种登录方式
- 完整的用户操作日志审计

### 3. 渠道管理模块

**核心功能**：管理大模型提供商的接入配置和状态。

**关键特性**：
- 支持多种主流大模型提供商
- 渠道健康状态自动检测
- 渠道优先级和权重配置
- 渠道级别的限流和配额控制
- 支持渠道分组和负载均衡

### 4. 模型管理模块

**核心功能**：管理支持的模型列表和路由规则。

**关键特性**：
- 模型自动发现和同步
- 自定义模型名称映射
- 灵活的路由规则配置
- 模型级别的计费规则
- 模型性能和成本统计分析

### 5. 令牌管理模块

**核心功能**：管理 API 访问令牌的生成、权限和生命周期。

**关键特性**：
- 支持长期令牌和临时令牌
- 细粒度的权限控制
- 令牌级别的配额和限流
- 令牌使用统计和审计
- 支持令牌的过期和吊销

### 6. 计费管理模块

**核心功能**：管理计费规则、消费统计和充值记录。

**关键特性**：
- 支持多种计费模式（按 token、按次、按时长等）
- 实时消费计算和统计
- 账户余额管理和预警
- 充值和消费记录查询
- 支持微信、支付宝等多种支付方式

### 7. 日志审计模块

**核心功能**：记录所有 API 调用和系统操作日志，提供审计能力。

**关键特性**：
- 完整的请求和响应日志记录
- 多维度日志查询和检索
- 调用量和成功率统计
- 异常请求识别和告警
- 支持日志导出和归档

### 8. 监控统计模块

**核心功能**：提供系统运行状态监控和业务数据分析。

**关键特性**：
- 实时监控大盘展示
- 多维度数据统计和报表
- 自定义告警规则配置
- 性能指标监控和分析
- 成本分析和优化建议

---

## 🔌 API 文档

### 公共 API 端点（兼容 OpenAI 规范）

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/chat/completions` | POST | 聊天补全（支持流式） |
| `/v1/completions` | POST | 文本补全 |
| `/v1/embeddings` | POST | 嵌入向量生成 |
| `/v1/images/generations` | POST | 图像生成 |
| `/v1/videos/generations` | POST | 视频生成 |
| `/v1/models` | GET | 获取可用模型列表 |

### 管理后台 API 端点

所有管理 API 位于 `/api/v1` 路径下，需要管理员 JWT token 认证：

| 端点分类 | 描述 |
|----------|------|
| `/api/v1/auth/*` | 认证相关接口（登录、登出、权限验证） |
| `/api/v1/users/*` | 用户管理接口 |
| `/api/v1/channels/*` | 渠道管理接口 |
| `/api/v1/models/*` | 模型管理接口 |
| `/api/v1/tokens/*` | 令牌管理接口 |
| `/api/v1/finance/*` | 财务和计费接口 |
| `/api/v1/logs/*` | 日志查询接口 |
| `/api/v1/settings/*` | 系统设置接口 |

完整的 API 文档请参考部署后的 Swagger 文档：`http://your-domain/api/docs`

---

## 🛠️ 开发指南

### 开发环境搭建

#### 方式一：Docker 热重载开发模式（推荐）

如果你在 Windows 等非原生 Linux 环境下开发，每次修改 Rust 会面临锁文件或编译缓慢的问题。我们提供了基于 Docker + `cargo-watch` 的**零配置热重载开发环境**：

只需在工程根目录执行（一次性拉起前后端与数据库）：

**Windows (PowerShell):**
```powershell
.\dev.ps1
```

**Linux/Mac:**
```bash
chmod +x dev.sh
./dev.sh
```

*保存任意 `backend/src/*.rs` 文件，后端即会在容器内秒级自动增量编译并热重载。`target` 缓存亦通过专用 Volume 隔离，不污染宿主机。*

#### 方式二：传统原生单机模式

需要你本地已安装完整的 Rust 和 Node.js 环境。

**后端 (Backend):**

后端采用 Rust 开发，配置管理遵循 **环境变量优先** 原则（配置优先级：系统环境变量 > `.env` 文件 > 内置默认值）。

1. **配置文件加载**：
   ```bash
   cd backend
   cp .env.example .env  # Windows使用 copy .env.example .env
   # 根据注释修改 .env （可参考内置的 .env.example 文件）
   ```

2. **运行后端**：
   ```bash
   cargo run
   # 或构建生产版本: cargo build --release
   ```

**前端 (Frontend):**

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
- 默认管理员账号：`admin` / `123456`

### 项目结构

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
├── docker-compose.yml      # Docker Compose 配置（内置 PostgreSQL，可切换外部数据库）
├── docker-compose.dev.yml  # Docker Compose 配置（开发热重载叠加层）
├── deploy.sh               # 一键交互式部署脚本
├── export-images.sh        # Docker 镜像导出脚本 (Linux/Mac)
├── export-images.ps1       # Docker 镜像导出脚本 (Windows)
├── README.md               # 项目文档
└── data/                   # 数据持久化目录
```

### CI/CD 自动化部署

项目已配置完整的 CI/CD 流程，支持代码质量保障、自动构建和部署。

#### GitHub Actions 工作流

| 工作流 | 触发条件 | 功能说明 |
|--------|----------|----------|
| **CI** | Push 到 main/develop 分支或 PR | 前端 lint + 构建，后端 clippy + 测试 + 构建 |
| **Release** | 推送 tag (如 `v1.0.0`) | 构建 Docker 镜像并推送到 GHCR，创建 GitHub Release |
| **Deploy** | 手动触发 | 部署到指定环境 (staging/production) |
| **Quick Deploy** | 手动触发或 push 到 main | 快速构建并部署，**跳过 lint/check**，适合快速验证 |

#### 本地快速部署脚本

#### Windows (PowerShell)
```powershell
.\scripts\quick-deploy.ps1
```

#### Windows (CMD)
```cmd
scripts\quick-deploy.bat
```

#### Linux/Mac
```bash
chmod +x scripts/quick-deploy.sh
./scripts/quick-deploy.sh
```

**脚本功能**：
1. 停止现有服务
2. 构建后端 Docker 镜像 (Rust)
3. 构建前端 Docker 镜像 (React)
4. 启动所有服务 (PostgreSQL + Backend + Frontend)
5. 等待并验证服务状态

### 常用运维命令

```bash
# 启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
docker compose logs -f frontend

# 停止服务
docker compose down

# 停止并删除数据卷
docker compose down -v

# 重新构建并启动
docker compose up -d --build

# 重启单个服务
docker compose restart backend

# 查看所有镜像
docker images | grep tokensbyte

# 清理未使用的镜像
docker image prune -f
```

---

## ❓ 常见问题解答

### Q: 如何指定使用 PostgreSQL 还是 SQLite？

A: 系统底部驱动 `sqlx` 会严格根据环境变量 `DATABASE_URL` 的**协议前缀**自动判断并切换底层数据库引擎，完全无需调整代码或装依赖：
- **使用 PostgreSQL（推荐生产）**：
  在 `.env` 或系统中配置 `DATABASE_URL=postgres://user:password@host:port/dbname`
- **使用 SQLite（推荐本地开发测试）**：
  在 `.env` 或系统中配置 `DATABASE_URL=sqlite://data/tokensbyte.db`

*注：项目当前默认使用 PostgreSQL。`docker-compose.yml` 内置了 PostgreSQL 服务并提供完整默认配置，支持 `docker compose up -d` 一键启动。如需使用外部数据库，修改 `.env` 中的 `DATABASE_URL` 并注释掉 compose 文件中的 `postgres` 服务即可。*

### Q: Docker 内置 PostgreSQL 和独立安装有什么区别？

A: 主要差异在于性能和运维管理：
- **Linux 环境**：Docker 内置性能损耗极小（<2%），完全可用于生产
- **Windows/Mac 环境**：Docker 文件系统映射会导致 15-40% 的 I/O 损耗，建议独立安装
- **运维管理**：独立安装可以使用原生 pg_dump 工具，调优更灵活
- **推荐使用**：开发测试用 Docker 内置，大规模生产用独立安装或云数据库

### Q: 支持哪些模型？

A: 支持 OpenAI、Anthropic、Google、火山引擎等主流大模型提供商，具体取决于您的渠道配置。系统设计为可扩展架构，支持快速接入新的模型提供商。

### Q: 如何迁移数据？

A: 如果使用 PostgreSQL，可以使用 `pg_dump` 和 `pg_restore` 工具进行数据迁移。SQLite 数据可以使用提供的迁移脚本转换到 PostgreSQL。如需迁移到更高版本，系统会自动执行数据库迁移脚本，无需手动干预。

### Q: 性能如何？

A: 基于 Rust + Tokio 异步架构构建，单实例可处理数千并发请求，延迟比 Node.js/Python 实现低 50% 以上。实际性能取决于服务器配置和上游模型响应速度。在 4核8G 服务器上，单实例可支持 2000+ QPS 的并发请求。

### Q: 如何监控服务状态？

A: 访问 `/health` 端点查看健康状态，或通过管理后台的监控大盘查看实时运行指标。也可以通过日志命令查看详细运行日志：
```bash
docker compose logs -f
```

### Q: 如何添加新的模型提供商？

A: 系统采用模块化设计，添加新的模型提供商只需：
1. 在 `backend/src/providers/` 目录下添加新的提供商实现
2. 实现统一的 Provider trait 接口
3. 在配置中添加对应的渠道类型
4. 重新编译部署即可

### Q: 是否支持私有化部署？

A: 完全支持私有化部署，所有代码均可在本地运行，无需依赖任何外部服务。您可以完全掌控数据和系统运行，满足企业安全合规要求。

---

## 🤝 贡献指南

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
- **提交信息**：使用语义化提交信息，格式为 `type(scope): description [T-XXX]`

---

## 📝 更新日志

查看 [UPDATE.md](UPDATE.md) 了解最新的版本更新和变更记录。

---

## 🛡️ 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 📞 联系方式

- 项目问题：[GitHub Issues](https://github.com/your-org/tokensbyte/issues)
- 商务合作：business@tokensbyte.com
- 技术交流：加入我们的 Discord 社区或微信群

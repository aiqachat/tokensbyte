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

## 📦 快速开始

### 1. 前置要求
- Docker & Docker Compose
- Rust (用于本地开发)
- Node.js (用于本地开发)

### 2. 访问系统
- **用户端 (Default)**：`http://localhost:5173` (提供令牌管理、日志查询)
- **系统后台 (Admin)**：`http://localhost:5173/admin0755` (提供渠道配置、用户及系统设置)

**默认管理员账号**：
- **用户名**：`admin`
- **密码**：`123456`

### 3. 使用 Docker Compose 部署
```bash
docker-compose up -d
```

### 4. 使用 API
配置您的 OpenAI SDK：
- **Base URL**: `http://localhost:3000/v1`
- **API Key**: `sk-xxxx` (在 TokensByte 后台生成)

## 🛠️ 开发环境搭建

### 后端 (Backend)
```bash
cd backend
cp .env.example .env
cargo run
```

### 前端 (Frontend)
```bash
cd frontend
npm install
npm run dev
```

## 🏗️ 技术栈
- **后端**：Rust, Axum, SQLx, SQLite/PostgreSQL
- **前端**：React, TypeScript, Ant Design 5, i18next, Zustand
- **部署**：Docker, Nginx, Docker Compose

## 🛡️ 许可证
MIT 许可证


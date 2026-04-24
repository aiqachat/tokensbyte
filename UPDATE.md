# 更新日志

## 2026-04-24

### 文档整合与优化

- 📝 合并三个独立部署文档至 README.md 主文档
  - `QUICK-EXPORT.md` → 方式四章节（离线/云端加速部署）
  - `EXPORT-IMAGES-GUIDE.md` → 方式四章节（完整三步流程、增量更新提示）
  - `DEPLOY-SCRIPT-GUIDE.md` → 方式二章节（交互流程说明、已有 .env 处理提示）
- 📝 删除 `deploy.ps1`，统一使用 `deploy.sh` 部署脚本
- 📝 更新相关文件引用（export-images.ps1 生成内容、README.md 项目结构等）
- 📝 新建 `agent.md`，包含文档管理规则和 Rust 代码质量标准（黄金三步 CI 检查）

### 删除文件

- `QUICK-EXPORT.md`
- `EXPORT-IMAGES-GUIDE.md`
- `DEPLOY-SCRIPT-GUIDE.md`
- `deploy.ps1`

### 新增文件

- `agent.md`

## 2026-04-22

### 修复问题
- 🔧 修复前端容器 healthcheck 显示 unhealthy
  - 根因：Alpine 的 wget 解析 localhost 优先走 IPv6（`[::1]`），而 Nginx 仅监听 IPv4
  - 修复：healthcheck URL 从 `http://localhost:80/` 改为 `http://127.0.0.1:80/`，强制走 IPv4

### 优化改进
- ⚡ PostgreSQL 版本从 15 升级到 16
  - 镜像从 `postgres:15-alpine` 更新为 `postgres:16-alpine`
  - ⚠️ 大版本升级不兼容旧数据卷，需按下方迁移步骤操作
- ⚡ docker-compose.yml 支持真正的 `docker compose up -d` 一键启动
  - 所有环境变量均提供 `${VAR:-default}` 默认值，无需 .env 文件即可启动
  - DATABASE_URL 从 `:?`（缺失报错）改为 `:-`（缺失用默认值）
  - 镜像策略：有现成镜像用现成镜像，没有则自动用 Dockerfile 构建
  - 配置优先级：.env 文件 > compose 内默认值

## 2026-04-15

### 新增功能
- ✅ Docker 镜像打包测试通过
- ✅ 完整的 Docker 部署文档（README.md）
- ✅ 生产环境 Docker Compose 配置（docker-compose.yml，内置 PostgreSQL，可切换外部数据库）
- ✅ 环境变量配置模板（.env.example）
- ✅ 一键部署脚本（deploy.sh）
  - **交互式配置引导**
  - **自动生成数据库密码**（16位强密码，包含大小写字母、数字、特殊字符）
  - **自动生成 JWT 密钥**（64位随机密钥）
  - 仅需输入管理员密码和选择是否允许注册
  - 显示配置摘要确认
  - 支持重新配置
  - 自动检测已有配置并显示
- ✅ 本地镜像导出工具（export-images.sh / export-images.ps1）
  - 支持在本地构建镜像并导出
  - 自动生成服务器导入脚本
  - 自动生成上传指南
  - 仅导出项目自定义镜像（后端 + 前端）
  - PostgreSQL 使用官方镜像，服务器自动拉取
- ✅ 镜像导出使用指南（已整合至 README.md）
- ✅ 快速参考卡片（已整合至 README.md）

### 修复问题
- 🔧 修复 TypeScript 类型错误
  - RequestLog 接口添加 upstream_url 字段
  - Upstreams.tsx 修复 Divider 组件 orientation 属性
- 🔧 修复导出脚本镜像获取逻辑
  - 改用 docker images 直接查询
  - 添加空值检查和默认值
- 🔧 优化导出流程
  - 移除 PostgreSQL 镜像导出（使用官方镜像）
  - 减小传输体积约 50%（从 511MB 降至 261MB）

### 文档改进
- 📝 完善 README.md
  - 新增 Docker 部署指南（4种方式）
  - 新增 HTTPS 部署配置
  - 新增部署架构图
  - 新增运维命令大全
  - 新增故障排查指南
  - 新增安全建议
  - 新增项目结构说明
  - 新增 API 文档示例
  - 新增常见问题
- 📝 镜像导出指南已整合至 README.md 方式四章节

### 优化改进
- ⚡ 镜像导出体积优化
  - 仅导出自定义镜像（后端 158MB + 前端 103MB = 261MB）
  - PostgreSQL 使用官方镜像，服务器自动拉取
  - 压缩后约 150-180MB，传输更快
- ⚡ 部署流程优化
  - 提供一键部署脚本
  - 提供本地打包+服务器部署方案
  - 支持多种传输方式（scp、rsync、云存储）

---

## 运维操作指南

### PostgreSQL 15 → 16 升级迁移

> ⚠️ PostgreSQL 大版本升级**不兼容现有数据卷**，PG 16 无法读取 PG 15 创建的数据目录。
> 必须先备份、删卷、再用新版本重建并恢复数据。

#### 前置条件

- 确认 `docker-compose.yml` 中 postgres 镜像已改为 `postgres:16-alpine`
- 确认远程服务器可以正常访问
- 确认磁盘空间充足（备份文件约为数据库大小的 1-2 倍）

#### 操作步骤

**1. 备份现有数据**

```bash
# 导出全部数据库（包含角色、表结构、数据）
docker exec tokensbyte-postgres pg_dumpall -U tokensapi > backup_$(date +%Y%m%d_%H%M%S).sql

# 验证备份文件不为空
ls -lh backup_*.sql
head -20 backup_*.sql
```

> 💡 建议将备份文件额外拷贝到本地或其他安全位置：
> ```bash
> scp user@server:~/backup_*.sql ./backup_local/
> ```

**2. 停止所有服务**

```bash
docker compose down
```

**3. 删除旧版本数据卷**

```bash
# 查看卷名称
docker volume ls | grep postgres

# 删除旧数据卷（PG 16 无法读取 PG 15 的数据目录，必须清除）
docker volume rm tokensbyte_postgres-data
```

**4. 拉取新镜像并启动**

```bash
docker compose pull postgres
docker compose up -d
```

**5. 等待 PostgreSQL 容器健康**

```bash
# 观察容器状态，直到 postgres 显示 healthy
docker compose ps

# 或实时查看日志
docker compose logs -f postgres
```

**6. 恢复数据**

```bash
# 将备份文件导入新数据库
cat backup_*.sql | docker exec -i tokensbyte-postgres psql -U tokensapi -d tokensapi
```

**7. 验证数据完整性**

```bash
# 检查数据库列表
docker exec tokensbyte-postgres psql -U tokensapi -l

# 检查关键表数据
docker exec tokensbyte-postgres psql -U tokensapi -d tokensapi -c "\dt"

# 检查 PostgreSQL 版本
docker exec tokensbyte-postgres psql -V
```

**8. 验证全部服务正常**

```bash
docker compose ps
# 三个容器均应显示 healthy 或 Up
```

#### 回退方案

如果升级后出现问题，可以回退到 PG 15：

```bash
# 1. 停止服务
docker compose down

# 2. 将 docker-compose.yml 中镜像改回 postgres:15-alpine

# 3. 删除 PG 16 的数据卷
docker volume rm tokensbyte_postgres-data

# 4. 启动 PG 15
docker compose up -d

# 5. 恢复备份
cat backup_*.sql | docker exec -i tokensbyte-postgres psql -U tokensapi -d tokensapi
```

#### 常见问题

| 问题 | 原因 | 解决 |
|:---|:---|:---|
| `the database system is starting up` | PG 正在初始化 | 等待片刻，观察日志 |
| `data directory was initialized by PostgreSQL version 15` | 旧数据卷未清除 | 执行步骤 3 删除旧卷 |
| 备份文件导入报 `role already exists` | pg_dumpall 包含角色创建语句 | 正常警告，可忽略 |
| 恢复后应用连接失败 | DATABASE_URL 配置有误 | 检查 .env 中连接字符串 |

# TokensByte Docker 镜像导出使用说明

## 📋 功能说明

当云服务器构建 Docker 镜像速度较慢时，可以在本地（开发机器）构建好镜像，然后导出并上传到云服务器进行部署。这样可以利用本地更强的性能快速完成构建。

## 🚀 快速开始

### 场景一：Windows 本地开发 → Linux 云服务器

#### 步骤 1：在本地导出镜像

```powershell
# 在项目根目录运行
.\export-images.ps1
```

脚本会提示选择构建模式：
- 选项 1：开发环境（SQLite）
- 选项 2：生产环境（PostgreSQL）- **推荐**

#### 步骤 2：上传文件到服务器

使用 WinSCP 或 scp 上传以下文件：
```
docker-images/
├── tokensbyte-backend-*.tar
├── tokensbyte-frontend-*.tar
├── postgres-16-alpine-*..tar (仅生产环境)
└── import-images.sh
```

同时上传：
- `docker-compose.prod.yml`
- `.env.example`

**使用 scp 示例：**
```powershell
scp .\docker-images\*.tar root@your-server:/opt/tokensbyte/
scp .\docker-images\import-images.sh root@your-server:/opt/tokensbyte/
scp docker-compose.prod.yml root@your-server:/opt/tokensbyte/
scp .env.example root@your-server:/opt/tokensbyte/
```

#### 步骤 3：在服务器导入并部署

```bash
# SSH 登录服务器
ssh root@your-server

# 进入部署目录
cd /opt/tokensbyte

# 导入镜像
chmod +x import-images.sh
./import-images.sh

# 配置环境变量
cp .env.example .env
nano .env  # 编辑配置，修改密码等

# 启动服务
docker compose -f docker-compose.prod.yml up -d

# 查看状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

### 场景二：Linux/Mac 本地开发 → Linux 云服务器

#### 步骤 1：在本地导出镜像

```bash
# 在项目根目录运行
chmod +x export-images.sh
./export-images.sh
```

#### 步骤 2：上传文件到服务器

```bash
# 使用 scp
scp docker-images/*.tar root@your-server:/opt/tokensbyte/
scp docker-images/import-images.sh root@your-server:/opt/tokensbyte/
scp docker-compose.prod.yml root@your-server:/opt/tokensbyte/
scp .env.example root@your-server:/opt/tokensbyte/

# 或使用 rsync（更快）
rsync -avz docker-images/ root@your-server:/opt/tokensbyte/
rsync docker-compose.prod.yml root@your-server:/opt/tokensbyte/
rsync .env.example root@your-server:/opt/tokensbyte/
```

#### 步骤 3：在服务器导入并部署

同场景一的步骤 3。

## 📦 文件说明

### 导出的文件

| 文件 | 说明 | 大小（约） |
|------|------|-----------|
| `tokensbyte-backend-*.tar` | 后端 Rust 服务镜像 | 158 MB |
| `tokensbyte-frontend-*.tar` | 前端 React 服务镜像 | 103 MB |
| `import-images.sh` | 服务器导入脚本 | - |
| `UPLOAD-GUIDE.txt` | 详细上传指南 | - |

> 💡 PostgreSQL 是官方镜像，服务器会自动从 Docker Hub 拉取，无需导出

### 服务器需要的文件

| 文件 | 必需 | 说明 |
|------|------|------|
| 所有 `.tar` 文件 | ✅ | Docker 镜像 |
| `import-images.sh` | ✅ | 导入脚本 |
| `docker-compose.prod.yml` | ✅ | 服务编排配置 |
| `.env` 或 `.env.example` | ✅ | 环境变量配置 |

## 💡 优化建议

### 1. 压缩传输（推荐用于网络较慢的情况）

**Linux/Mac:**
```bash
cd docker-images
tar -czf tokensbyte-images.tar.gz *.tar
# 上传压缩文件（约减小 30-40%）
scp tokensbyte-images.tar.gz root@your-server:/opt/tokensbyte/

# 在服务器解压
ssh root@your-server
cd /opt/tokensbyte
tar -xzf tokensbyte-images.tar.gz
```

**Windows:**
```powershell
Compress-Archive -Path ".\docker-images\*.tar" -DestinationPath ".\docker-images\tokensbyte-images.zip"

# 上传后在服务器解压
ssh root@your-server
cd /opt/tokensbyte
unzip tokensbyte-images.zip
```

### 2. 使用云存储中转

如果镜像文件很大（>500MB），建议：

1. 上传到云存储（阿里云 OSS、腾讯云 COS、AWS S3 等）
2. 在服务器从云存储下载

```bash
# 在服务器下载
wget https://your-oss-url/tokensbyte-images.tar.gz
tar -xzf tokensbyte-images.tar.gz
```

### 3. 增量更新

如果只是更新了代码，不需要重新导出所有镜像：

```bash
# 只导出更新的镜像
docker save -o docker-images/tokensbyte-backend-new.tar tokensbyte-backend:latest

# 在服务器只导入更新的镜像
docker load -i tokensbyte-backend-new.tar

# 重启服务
docker compose -f docker-compose.prod.yml up -d
```

## 🔧 常见问题

### Q1: 镜像文件太大怎么办？

A: 使用压缩传输，可以减小 30-40% 的体积。

### Q2: 上传速度慢怎么办？

A: 
1. 使用 rsync 代替 scp（支持断点续传）
2. 使用云存储中转
3. 配置 SSH 压缩：`scp -C`

### Q3: 服务器导入失败怎么办？

A: 检查以下几点：
1. Docker 是否正常：`docker --version`
2. 磁盘空间是否足够：`df -h`
3. 镜像文件是否完整：`ls -lh *.tar`
4. 查看详细错误：`./import-images.sh` 的输出

### Q4: 如何验证镜像是否正确导入？

A: 运行以下命令查看：
```bash
docker images | grep tokensbyte
docker images | grep postgres
```

应该能看到：
- `tokensbyte-backend:latest`
- `tokensbyte-frontend:latest`

> PostgreSQL 镜像会在首次启动时自动从 Docker Hub 拉取

### Q5: 多久需要重新导出镜像？

A: 
- 代码更新后需要重新构建和导出
- 依赖更新后需要重新构建
- 如果只修改配置（.env），不需要重新导出

## 📝 完整工作流程示例

```bash
# === 本地开发机 ===

# 1. 更新代码
git pull

# 2. 导出镜像
./export-images.sh
# 选择 2) 生产环境

# 3. 压缩文件（可选）
cd docker-images
tar -czf tokensbyte-images-$(date +%Y%m%d).tar.gz *.tar

# 4. 上传到服务器
scp tokensbyte-images-*.tar.gz root@192.168.1.100:/opt/tokensbyte/
scp ../docker-compose.prod.yml root@192.168.1.100:/opt/tokensbyte/

# === 云服务器 ===

# 5. SSH 登录
ssh root@192.168.1.100

# 6. 导入镜像
cd /opt/tokensbyte
tar -xzf tokensbyte-images-*.tar.gz
chmod +x import-images.sh
./import-images.sh

# 7. 更新配置（首次部署）
cp .env.example .env
nano .env

# 8. 启动服务
docker compose -f docker-compose.prod.yml up -d

# 9. 验证
docker compose -f docker-compose.prod.yml ps
curl http://localhost:5173
```

## 🎯 最佳实践

1. **定期更新**：每次代码更新后都重新导出镜像
2. **版本管理**：在文件名中加入日期或版本号
3. **备份旧镜像**：服务器上保留上一版本的镜像
4. **测试环境验证**：先在测试环境导入验证，再部署到生产
5. **自动化脚本**：可以将整个流程写成 CI/CD 流水线

## 📞 需要帮助？

如果遇到问题，请查看：
- `docker-images/UPLOAD-GUIDE.txt` - 详细上传指南
- `README.md` - 完整部署文档
- Docker 日志：`docker compose logs -f`

# Docker 镜像导出快速参考

## 🚀 一键导出（三步完成）

### Windows
```powershell
# 1. 运行导出脚本
.\export-images.ps1

# 2. 等待构建和导出完成
# 文件会保存到: .\docker-images\

# 3. 上传到服务器
scp .\docker-images\*.tar root@your-server:/opt/tokensbyte/
scp .\docker-images\import-images.sh root@your-server:/opt/tokensbyte/
scp docker-compose.yml root@your-server:/opt/tokensbyte/
```

### Linux/Mac
```bash
# 1. 运行导出脚本
chmod +x export-images.sh
./export-images.sh

# 2. 等待构建和导出完成
# 文件会保存到: ./docker-images/

# 3. 上传到服务器
scp docker-images/*.tar root@your-server:/opt/tokensbyte/
scp docker-images/import-images.sh root@your-server:/opt/tokensbyte/
scp docker-compose.yml root@your-server:/opt/tokensbyte/
```

## 📋 服务器部署

```bash
# SSH 登录
ssh root@your-server

# 进入目录
cd /opt/tokensbyte

# 导入镜像
chmod +x import-images.sh
./import-images.sh

# 配置环境
cp .env.example .env
nano .env  # 修改密码等配置

# 启动服务
docker compose up -d

# 查看状态
docker compose ps
docker compose logs -f
```

## 💡 优化技巧

### 压缩传输（减小 30-40% 体积）
```bash
# Windows
Compress-Archive -Path ".\docker-images\*.tar" -DestinationPath ".\docker-images\images.zip"
scp .\docker-images\images.zip root@server:/opt/tokensbyte/

# Linux/Mac
cd docker-images
tar -czf images.tar.gz *.tar
scp images.tar.gz root@server:/opt/tokensbyte/
```

### 使用 rsync（支持断点续传）
```bash
rsync -avz --progress docker-images/ root@server:/opt/tokensbyte/
```

## 📊 文件大小参考

| 镜像 | 大小 |
|------|------|
| tokensbyte-backend | ~158 MB |
| tokensbyte-frontend | ~103 MB |
| **总计** | **~261 MB** |
| **压缩后** | **~150-180 MB** |

> 💡 PostgreSQL 是官方镜像，服务器会自动从 Docker Hub 拉取，无需导出

## ❓ 常见问题

**Q: 脚本运行失败？**
A: 确保已安装 Docker Desktop 并启动

**Q: 镜像找不到？**
A: 先运行 `docker compose build` 构建镜像

**Q: 上传速度慢？**
A: 使用压缩或云存储中转

**Q: 服务器导入失败？**
A: 检查磁盘空间 `df -h`，确保足够

## 📖 完整文档

- 详细说明: `EXPORT-IMAGES-GUIDE.md`
- 上传指南: `docker-images/UPLOAD-GUIDE.txt`（自动生成）
- 主文档: `README.md`

#!/bin/bash

# TokensByte Docker 镜像导出脚本
# 在本地构建并导出镜像，用于上传到云服务器

set -e

OUTPUT_DIR="./docker-images"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "========================================="
echo "  TokensByte Docker 镜像导出脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo ""

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 询问构建模式
echo "请选择构建模式:"
echo "  1) 开发环境 (使用 docker-compose.yml)"
echo "  2) 生产环境 (使用 docker-compose.prod.yml)"
echo ""
read -p "请输入选项 (1/2): " mode

case $mode in
    1)
        COMPOSE_FILE="docker-compose.yml"
        ENV_NAME="development"
        ;;
    2)
        COMPOSE_FILE="docker-compose.prod.yml"
        ENV_NAME="production"
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""
echo "📦 开始构建 Docker 镜像 ($ENV_NAME)..."
echo ""

# 构建镜像
if [ "$mode" = "2" ]; then
    docker compose -f "$COMPOSE_FILE" build
else
    docker compose build
fi

echo ""
echo "✅ 镜像构建完成！"
echo ""

# 获取镜像信息
echo "📋 镜像信息:"
if [ "$mode" = "2" ]; then
    docker compose -f "$COMPOSE_FILE" images
    # 使用更可靠的方式获取镜像名称
    BACKEND_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "tokensbyte-backend" | head -n1)
    FRONTEND_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "tokensbyte-frontend" | head -n1)
    # PostgreSQL 是官方镜像，服务器可以直接拉取，不需要导出
else
    docker compose images
    BACKEND_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "tokensbyte-backend" | head -n1)
    FRONTEND_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "tokensbyte-frontend" | head -n1)
fi

# 如果未找到镜像，使用默认值
if [ -z "$BACKEND_IMAGE" ]; then
    BACKEND_IMAGE="tokensbyte-backend:latest"
fi
if [ -z "$FRONTEND_IMAGE" ]; then
    FRONTEND_IMAGE="tokensbyte-frontend:latest"
fi

echo ""

# 导出镜像
echo "📤 开始导出镜像..."
echo ""

# 导出后端镜像
BACKEND_FILE="$OUTPUT_DIR/tokensbyte-backend-${TIMESTAMP}.tar"
echo "  → 导出后端镜像到: $BACKEND_FILE"
docker save -o "$BACKEND_FILE" "$BACKEND_IMAGE"
BACKEND_SIZE=$(du -h "$BACKEND_FILE" | cut -f1)
echo "    大小: $BACKEND_SIZE"

# 导出前端镜像
FRONTEND_FILE="$OUTPUT_DIR/tokensbyte-frontend-${TIMESTAMP}.tar"
echo "  → 导出前端镜像到: $FRONTEND_FILE"
docker save -o "$FRONTEND_FILE" "$FRONTEND_IMAGE"
FRONTEND_SIZE=$(du -h "$FRONTEND_FILE" | cut -f1)
echo "    大小: $FRONTEND_SIZE"

echo ""
echo "💡 提示: PostgreSQL 是官方镜像，服务器部署时会自动从 Docker Hub 拉取"

echo ""
echo "========================================="
echo "  导出完成！"
echo "========================================="
echo ""
echo "📁 导出文件列表:"
ls -lh "$OUTPUT_DIR"/*${TIMESTAMP}.tar
echo ""

# 计算总大小
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo "📊 总大小: $TOTAL_SIZE"
echo ""

# 生成导入脚本 (Linux/Mac)
cat > "$OUTPUT_DIR/import-images.sh" << 'EOF'
#!/bin/bash

# TokensByte Docker 镜像导入脚本 (Linux/Mac)
# 在云服务器上运行此脚本导入镜像

set -e

echo "========================================="
echo "  TokensByte Docker 镜像导入脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo ""

# 查找所有 tar 文件
tar_files=$(ls *.tar 2>/dev/null || true)

if [ -z "$tar_files" ]; then
    echo "❌ 错误: 当前目录未找到 .tar 镜像文件"
    echo "   请将导出的镜像文件上传到此目录"
    exit 1
fi

echo "📥 开始导入镜像..."
echo ""

# 导入每个镜像文件
for tar_file in *.tar; do
    if [ -f "$tar_file" ]; then
        echo "  → 导入: $tar_file"
        docker load -i "$tar_file"
        echo ""
    fi
done

echo "✅ 所有镜像导入完成！"
echo ""
echo "💡 提示: PostgreSQL 镜像将在启动时自动从 Docker Hub 拉取"
echo ""

echo "========================================="
echo "  后续步骤"
echo "========================================="
echo ""
echo "1. 上传 docker-compose.prod.yml 到服务器"
echo "2. 创建 .env 配置文件 (运行 deploy.sh 会自动引导配置)"
echo "3. 启动服务:"
echo "   docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "或者直接使用部署脚本:"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
EOF

chmod +x "$OUTPUT_DIR/import-images.sh"
echo "✅ 已生成 Linux/Mac 导入脚本: $OUTPUT_DIR/import-images.sh"
echo ""

# 生成传输说明
cat > "$OUTPUT_DIR/UPLOAD-GUIDE.txt" << EOF
========================================
  TokensByte 镜像上传指南
========================================

📦 导出时间: $(date '+%Y-%m-%d %H:%M:%S')
🔧 构建模式: $ENV_NAME

📁 需要上传的文件:
$(ls -lh "$OUTPUT_DIR"/*${TIMESTAMP}.tar | xargs -I {} basename {})
- import-images.sh (导入脚本)
- docker-compose.prod.yml (如果使用生产模式)

📊 总大小: $TOTAL_SIZE

========================================
  上传方法
========================================

方法一: 使用 scp (推荐)
----------------------
# 在本地终端执行 (不是在此目录)
scp $OUTPUT_DIR/*.tar your-user@your-server:/path/to/deploy/
scp $OUTPUT_DIR/import-images.sh your-user@your-server:/path/to/deploy/
scp docker-compose.prod.yml your-user@your-server:/path/to/deploy/

示例:
scp docker-images/*.tar root@192.168.1.100:/opt/tokensbyte/
scp docker-images/import-images.sh root@192.168.1.100:/opt/tokensbyte/
scp docker-compose.prod.yml root@192.168.1.100:/opt/tokensbyte/


方法二: 使用 rsync
----------------------
rsync -avz $OUTPUT_DIR/ your-user@your-server:/path/to/deploy/

示例:
rsync -avz docker-images/ root@192.168.1.100:/opt/tokensbyte/


方法三: 使用 SFTP
----------------------
sftp your-user@your-server
cd /path/to/deploy
put docker-images/*.tar
put docker-images/import-images.sh
put docker-compose.prod.yml


方法四: 使用云存储 (大文件推荐)
----------------------
1. 压缩文件:
   cd docker-images
   tar -czf tokensbyte-images-${TIMESTAMP}.tar.gz *.tar import-images.sh

2. 上传到 OSS/S3/网盘

3. 在服务器下载并解压:
   wget <download-url>
   tar -xzf tokensbyte-images-${TIMESTAMP}.tar.gz

========================================
  服务器部署步骤
========================================

1. SSH 登录到服务器:
   ssh your-user@your-server

2. 进入部署目录:
   cd /path/to/deploy

3. 导入镜像:
   chmod +x import-images.sh
   ./import-images.sh

4. 创建环境变量文件:
   cp .env.example .env
   nano .env  # 编辑配置

5. 启动服务:
   docker compose -f docker-compose.prod.yml up -d

6. 查看状态:
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs -f

========================================
  注意事项
========================================

⚠️  确保服务器已安装 Docker 和 Docker Compose
⚠️  生产环境必须修改 .env 中的默认密码
⚠️  建议配置防火墙仅开放 80/443 端口
⚠️  定期备份数据库数据卷

========================================

EOF

echo "✅ 已生成上传指南: $OUTPUT_DIR/UPLOAD-GUIDE.txt"
echo ""

echo "========================================="
echo "  总结"
echo "========================================="
echo ""
echo "📦 导出文件:"
echo "   目录: $OUTPUT_DIR/"
echo "   文件数: $(ls "$OUTPUT_DIR"/*${TIMESTAMP}.tar 2>/dev/null | wc -l) 个镜像"
echo "   总大小: $TOTAL_SIZE"
echo ""
echo "📤 下一步:"
echo "   1. 查看上传指南: cat $OUTPUT_DIR/UPLOAD-GUIDE.txt"
echo "   2. 上传文件到服务器 (参考 UPLOAD-GUIDE.txt)"
echo "   3. 在服务器运行: ./import-images.sh"
echo "   4. 启动服务: docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "💡 提示: 可以使用压缩减小传输体积"
echo "   cd $OUTPUT_DIR"
echo "   tar -czf tokensbyte-images.tar.gz *.tar"
echo ""

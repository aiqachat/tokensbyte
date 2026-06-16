#!/bin/bash

# TokensByte Docker 镜像推送脚本
# ──────────────────────────────────────────────────

set -e

# 项目名称配置：优先使用环境变量PROJECT_NAME，否则读取当前目录名
PROJECT_NAME=${PROJECT_NAME:-$(basename "$PWD")}

echo "========================================="
echo "  TokensByte Docker 镜像推送脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo ""

# 目标仓库地址配置
REGISTRY_BACKEND="docker.cnb.cool/netbcloud/tokensbyte-ws/tokensbyte-ws-backend"
REGISTRY_FRONTEND="docker.cnb.cool/netbcloud/tokensbyte-ws/tokensbyte-ws-frontend"

# 1. 询问是否需要先构建镜像
echo "❓ 是否需要先构建最新的本地镜像？"
echo "   [1] 是，构建最新镜像并在构建后推送 (推荐)"
echo "   [2] 否，直接推送当前已有的本地镜像"
read -p "请输入 [1/2] (默认 1): " BUILD_CHOICE
BUILD_CHOICE=${BUILD_CHOICE:-1}

if [ "$BUILD_CHOICE" = "1" ]; then
    echo ""
    echo "📦 开始构建 Docker 镜像..."
    # 针对 Mac 平台做 linux/amd64 构建优化
    if [[ "$(uname -s)" == "Darwin" ]]; then
        echo "🍎 检测到 Mac 环境，正在设置构建架构为 linux/amd64..."
        export DOCKER_DEFAULT_PLATFORM=linux/amd64
    fi

    export PROJECT_NAME="$PROJECT_NAME"
    docker compose build
    
    if [ $? -ne 0 ]; then
        echo "❌ 镜像构建失败，推送终止！"
        exit 1
    fi
    echo "✅ 镜像构建完成！"
    echo ""
fi

# 2. 获取推送的 Tag 标签
read -p "🏷️ 请输入要推送的 Tag 标签 (默认: latest): " TAG
TAG=${TAG:-latest}

BACKEND_LOCAL_IMAGE="${PROJECT_NAME}-backend:latest"
FRONTEND_LOCAL_IMAGE="${PROJECT_NAME}-frontend:latest"

# 3. 验证本地镜像是否存在
if ! docker images -q "$BACKEND_LOCAL_IMAGE" | grep -q .; then
    echo "❌ 错误: 本地未找到对应的后端镜像: $BACKEND_LOCAL_IMAGE"
    exit 1
fi
if ! docker images -q "$FRONTEND_LOCAL_IMAGE" | grep -q .; then
    echo "❌ 错误: 本地未找到对应的前端镜像: $FRONTEND_LOCAL_IMAGE"
    exit 1
fi

# 4. 重新打标签 (Tag)
REMOTE_BACKEND_IMAGE="${REGISTRY_BACKEND}:${TAG}"
REMOTE_FRONTEND_IMAGE="${REGISTRY_FRONTEND}:${TAG}"

echo ""
echo "🏷️  正在为本地镜像打标签..."
echo "   → 后端: $BACKEND_LOCAL_IMAGE => $REMOTE_BACKEND_IMAGE"
docker tag "$BACKEND_LOCAL_IMAGE" "$REMOTE_BACKEND_IMAGE"

echo "   → 前端: $FRONTEND_LOCAL_IMAGE => $REMOTE_FRONTEND_IMAGE"
docker tag "$FRONTEND_LOCAL_IMAGE" "$REMOTE_FRONTEND_IMAGE"

# 5. 推送镜像 (Push)
echo ""
echo "🚀 正在推送镜像到远程仓库..."
echo "   请确保您已通过 'docker login docker.cnb.cool' 登录相关账号！"
echo ""

echo "📤 正在推送后端镜像: $REMOTE_BACKEND_IMAGE"
docker push "$REMOTE_BACKEND_IMAGE"
if [ $? -ne 0 ]; then
    echo "❌ 后端镜像推送失败！请检查网络或登录状态。"
    exit 1
fi

echo ""
echo "📤 正在推送前端镜像: $REMOTE_FRONTEND_IMAGE"
docker push "$REMOTE_FRONTEND_IMAGE"
if [ $? -ne 0 ]; then
    echo "❌ 前端镜像推送失败！请检查网络或登录状态。"
    exit 1
fi

echo ""
echo "========================================="
echo "  🎉 所有镜像推送成功！"
echo "========================================="
echo "   后端: $REMOTE_BACKEND_IMAGE"
echo "   前端: $REMOTE_FRONTEND_IMAGE"
echo ""

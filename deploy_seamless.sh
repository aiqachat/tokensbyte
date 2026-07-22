#!/bin/bash
# 线上无缝更新部署脚本 (Zero-Downtime Deployment)
set -e

PROJECT_NAME=${PROJECT_NAME:-$(basename "$PWD")}

echo "========================================="
echo "  🚀 开始无缝更新 (Zero-Downtime Update)"
echo "========================================="
echo ""

# 1. 检查当前是否已有服务在运行
if ! docker compose ps | grep -q "backend"; then
    echo "⚠️ 未检测到正在运行的 backend 服务，将执行常规首次部署..."
    bash deploy.sh
    exit 0
fi

# 获取当前运行的第一个后端容器ID
OLD_CONTAINER_ID=$(docker compose ps -q backend | head -n 1)

if [ -z "$OLD_CONTAINER_ID" ]; then
    echo "❌ 无法获取旧容器 ID"
    exit 1
fi

echo "📦 1. 正在构建最新镜像..."
docker compose build backend frontend

echo "⏫ 2. 扩容启动新版本后端容器 (Scale=2)..."
docker compose up -d --no-deps --scale backend=2 --no-recreate backend

# 获取新启动的容器ID (排除旧容器ID)
NEW_CONTAINER_ID=$(docker compose ps -q backend | grep -v "$OLD_CONTAINER_ID" | head -n 1)

if [ -z "$NEW_CONTAINER_ID" ]; then
    echo "❌ 无法识别新启动的容器 ID"
    exit 1
fi

echo "⏳ 3. 等待新容器启动并执行数据库迁移 (最长等待 90 秒)..."
# 循环探测容器内置的 Healthcheck 状态
HEALTHY=false
for i in {1..18}; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$NEW_CONTAINER_ID" 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
        HEALTHY=true
        echo "✅ 新容器 (ID: ${NEW_CONTAINER_ID:0:8}) 已就绪并完成数据库迁移！"
        break
    fi
    sleep 5
done

if [ "$HEALTHY" = false ]; then
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$NEW_CONTAINER_ID" 2>/dev/null || echo "unknown")
    echo "❌ 新容器未能在 90 秒内健康启动 (当前状态: $STATUS)"
    echo "⚠️ 回滚操作：自动移除新启动的异常容器，维持原服务运行..."
    docker stop "$NEW_CONTAINER_ID"
    docker rm "$NEW_CONTAINER_ID"
    docker compose up -d --no-deps --scale backend=1 --no-recreate backend
    exit 1
fi

echo "🔄 4. 正在平滑更新前端 Nginx 容器..."
docker compose up -d --no-deps frontend

echo "⏬ 5. 正在下线并移除旧版本后端容器..."
docker stop "$OLD_CONTAINER_ID"
docker rm "$OLD_CONTAINER_ID"

echo "🔧 6. 恢复单实例配置记录..."
docker compose up -d --no-deps --scale backend=1 --no-recreate backend

echo ""
echo "🎉 恭喜！无缝更新顺利完成，全程服务未中断。"

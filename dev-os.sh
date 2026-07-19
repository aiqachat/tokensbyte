#!/bin/bash
# ──────────────────────────────────────────────────
# TokensByte 开源版本地开发后台启动脚本 (已修正变量)
# ──────────────────────────────────────────────────
set -e

PROJECT_NAME="tokensbyte-ws"
export POSTGRES_PORT=5433
export DATABASE_URL="postgres://tokensapi:tokensapi@localhost:${POSTGRES_PORT}/tokensapi"
export RUST_LOG="info"
export PORT=3001
export VITE_API_TARGET="http://127.0.0.1:3001"

echo "🚀 正在后台启动开源版开发环境..."

# 1. 启动 Docker 中的 Postgres-os
export PROJECT_NAME="${PROJECT_NAME}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres-os

echo "⏳ 等待开源版数据库就绪..."
for i in $(seq 1 30); do
    if docker exec "${PROJECT_NAME}-postgres-os" pg_isready -U tokensapi &>/dev/null; then
        echo "✅ 开源版数据库已就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ 开源版数据库启动超时，请检查 Docker"
        exit 1
    fi
    sleep 1
done

# 2. 检查并安装开源版前端依赖
if [ ! -d "opensource/frontend/node_modules" ]; then
    echo "📦 正在安装开源版前端依赖 (使用国内镜像源)..."
    cd opensource/frontend && npm install --registry=https://registry.npmmirror.com && cd ../..
fi

# 3. 清理可能残留的后台进程与端口
echo "🧹 正在清理冲突进程与端口..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true

# 4. 在后台启动开源版后端和前端服务，日志输出到相应 log 文件中
echo "⚙️ 启动后台开源版 Rust 服务 (watch模式)..."
# 显式传递 PORT 与 DATABASE_URL，防止默认使用 3000 与 Pro 版数据库
nohup sh -c "cd opensource/backend && PORT=3001 DATABASE_URL=\"$DATABASE_URL\" DATA_DIR=data_opensource cargo watch -w src -x run" > os_backend_dev.log 2>&1 &
disown

echo "⚙️ 启动后台开源版 Vite 服务..."
# 显式传递 VITE_API_TARGET 指向 3001 API 服务
nohup sh -c "cd opensource/frontend && VITE_API_TARGET=\"$VITE_API_TARGET\" npm run dev -- --port 5174" > os_frontend_dev.log 2>&1 &
disown

# 5. 循环等待端口就绪，成功后脚本即刻退出
echo "⏳ 等待开源版后端 (3001) 和前端 (5174) 服务响应..."
for i in $(seq 1 120); do
    if lsof -i:3001 -t >/dev/null && lsof -i:5174 -t >/dev/null; then
        echo "🎉 开源版本地开发测试环境已在后台顺利拉起！"
        echo "   👉 前端面板: http://localhost:5174"
        echo "   👉 后端 API: http://localhost:3001"
        echo "   (日志分别保存在 os_backend_dev.log 和 os_frontend_dev.log 中)"
        exit 0
    fi
    sleep 1
done

echo "❌ 启动超时，请检查 os_backend_dev.log / os_frontend_dev.log 日志内容。"
exit 1

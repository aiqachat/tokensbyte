#!/bin/bash
# ──────────────────────────────────────────────────
# TokensByte 本地核心代码后台启动脚本 (已简化优化)
# ──────────────────────────────────────────────────
set -e

PROJECT_NAME="tokensbyte-ws"
export POSTGRES_PORT=5432
export DATABASE_URL="postgres://tokensapi:tokensapi@localhost:${POSTGRES_PORT}/tokensapi"
export RUST_LOG="info"

echo "🚀 正在后台启动本地开发环境..."

# 1. 启动 Docker 中的 Postgres
export PROJECT_NAME="${PROJECT_NAME}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

echo "⏳ 等待数据库就绪..."
for i in $(seq 1 30); do
    if docker exec "${PROJECT_NAME}-postgres" pg_isready -U tokensapi &>/dev/null; then
        echo "✅ 数据库已就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ 数据库启动超时，请检查 Docker"
        exit 1
    fi
    sleep 1
done

# 2. 检查并安装前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 正在安装前端依赖 (使用国内镜像源)..."
    cd frontend && npm install --registry=https://registry.npmmirror.com && cd ..
fi

# 3. 清理可能残留的后台进程与端口
echo "🧹 正在清理冲突进程与端口..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
pkill -f cargo-watch 2>/dev/null || true
pkill -f tokensbyte-server 2>/dev/null || true
pkill -f vite 2>/dev/null || true

# 4. 在后台启动后端和前端服务，日志输出到相应 log 文件中
echo "⚙️ 启动后台 Rust 服务 (watch模式)..."
nohup sh -c "cd backend && cargo watch -w src -x run" > backend_dev.log 2>&1 &
disown

echo "⚙️ 启动后台 Vite 服务..."
nohup sh -c "cd frontend && npm run dev" > frontend_dev.log 2>&1 &
disown

# 5. 循环等待端口就绪，成功后脚本即刻退出
echo "⏳ 等待后端 (3000) 和前端 (5173) 服务响应..."
for i in $(seq 1 120); do
    # 只要 5173 (Vite) 和 3000 (Rust) 端口都被监听，就代表启动成功
    if lsof -i:3000 -t >/dev/null && lsof -i:5173 -t >/dev/null; then
        echo "🎉 本地开发测试环境已在后台顺利拉起！"
        echo "   👉 前端面板: http://localhost:5173"
        echo "   👉 后端 API: http://localhost:3000"
        echo "   (日志分别保存在 backend_dev.log 和 frontend_dev.log 中)"
        exit 0
    fi
    sleep 1
done

echo "❌ 启动超时，请检查 backend_dev.log / frontend_dev.log 日志内容。"
exit 1

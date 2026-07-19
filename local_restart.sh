#!/bin/bash
set -e

export PROJECT_NAME=${PROJECT_NAME:-$(basename "$PWD")}

echo "==== 重启 TokensByte 前后端开发服务 ===="

# 1. 杀死残留进程
echo "🧹 正在清理 3000 和 5173 端口的残留进程..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
pkill -f cargo-watch 2>/dev/null || true
pkill -f tokensbyte-server 2>/dev/null || true

# 2. 确保 Docker 中的 Postgres 正常运行
echo "🐳 检查 Docker 运行状态..."
if ! docker info > /dev/null 2>&1; then
    echo "🐳 Docker 未运行，尝试启动 Docker..."
    if [ -d "/Applications/OrbStack.app" ]; then
        open -a OrbStack
    elif [ -d "/Applications/Docker.app" ]; then
        open -a Docker
    else
        echo "❌ 无法自动找到 Docker 应用程序，请手动启动。"
        exit 1
    fi
    echo "⏳ 等待 Docker 启动 (可能需要几十秒)..."
    for i in $(seq 1 60); do
        if docker info > /dev/null 2>&1; then
            echo "✅ Docker 已成功启动"
            break
        fi
        if [ "$i" -eq 60 ]; then
            echo "❌ Docker 启动超时，请手动检查 Docker 状态。"
            exit 1
        fi
        sleep 2
    done
fi

echo "🐳 重启 Docker 中的 Postgres..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml down 2>/dev/null || true
docker network rm tokensbyte-network 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

# 3. 等待数据库可用
echo "⏳ 等待数据库就绪..."
for i in $(seq 1 30); do
    if docker exec "${PROJECT_NAME}-postgres" pg_isready -U tokensapi &>/dev/null; then
        echo "✅ 数据库已就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ 数据库启动超时"
        exit 1
    fi
    sleep 1
done

# 4. 导出环境变量并启动后端
echo "🚀 启动 Rust 后端服务 (端口 3000)..."
export DATABASE_URL="postgres://tokensapi:tokensapi@localhost:5432/tokensapi"
export RUST_LOG="info"

cd backend
nohup cargo watch -w src -x run > ../backend_daemon.log 2>&1 &
echo $! > backend.pid
cd ..

# 5. 启动前端服务 (端口 5173)...
echo "🚀 启动 Vite 前端服务 (端口 5173)..."
cd frontend
nohup npm run dev > ../frontend_daemon.log 2>&1 &
echo $! > frontend.pid
cd ..

echo "🎉 服务重启指令已发送，正在后台运行。"
echo "- 后端日志见 backend_daemon.log"
echo "- 前端日志见 frontend_daemon.log"

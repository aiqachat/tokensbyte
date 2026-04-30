#!/bin/bash

# TokensByte 开发环境启动脚本 (macOS / Linux)
# ──────────────────────────────────────────────────

set -e

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🛠  TokensByte 开发环境启动器"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  [1] 本地开发  (推荐，编译速度快)"
echo "      Postgres 在 Docker 中运行"
echo "      后端 cargo watch + 前端 Vite HMR 在本地运行"
echo ""
echo "  [2] Docker 开发  (全容器热重载)"
echo "      所有服务在 Docker 中运行"
echo "      源码挂载到容器，自动热更新"
echo ""
echo "═══════════════════════════════════════════════════"
echo ""
printf "请选择开发模式 [1/2] (默认 1): "
read -r choice

case "${choice:-1}" in
  2)
    # ── Docker 全容器开发模式 ──────────────────────────
    echo ""
    echo "🐳 正在启动 Docker 全容器开发环境 (热重载)..."
    echo "   后端: cargo watch (容器内编译)"
    echo "   前端: Vite HMR (容器内运行)"
    echo "   数据库: Postgres 16"
    echo ""
    echo "   后端地址: http://localhost:3000"
    echo "   前端地址: http://localhost:${FRONTEND_PORT:-5173}"
    echo ""
    echo "   按 Ctrl+C 停止所有服务"
    echo ""

    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
    ;;

  1|"")
    # ── 本地开发模式 ──────────────────────────────────
    echo ""
    echo "🚀 正在启动本地开发环境 (数据库在 Docker 中运行)..."

    # 1. 启动 Docker 中的 Postgres（合并 dev.yml 以获取端口映射）
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

    echo "⏳ 等待数据库就绪..."
    # 等待 Postgres 健康检查通过
    for i in $(seq 1 30); do
        if docker exec tokensbyte-postgres pg_isready -U tokensapi &>/dev/null; then
            echo "✅ 数据库已就绪"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "❌ 数据库启动超时，请检查 Docker"
            exit 1
        fi
        sleep 1
    done

    # 2. 如果没有安装 cargo watch，提示用户
    if ! command -v cargo-watch &> /dev/null; then
        echo "⚠️ 未找到 cargo-watch，正在尝试自动安装 (这可能需要一小段时间)..."
        cargo install cargo-watch
    fi

    # 3. 检查并安装前端依赖
    if [ ! -d "frontend/node_modules" ]; then
        echo "📦 正在安装前端依赖..."
        cd frontend && npm install && cd ..
    fi

    # 4. 导出环境变量，让本地 backend 连接到 localhost
    export DATABASE_URL="postgres://tokensapi:tokensapi@localhost:5432/tokensapi"
    export RUST_LOG="info"

    echo ""
    echo "✅ 准备就绪，同时拉起后端和前端服务..."
    echo "   后端地址: http://localhost:3000"
    echo "   前端地址: http://localhost:5173"
    echo ""
    echo "   按 Ctrl+C 停止所有服务"
    echo ""

    # 捕获退出信号，确保子进程一并终止
    trap 'echo ""; echo "🛑 正在停止所有服务..."; kill 0; wait 2>/dev/null' EXIT INT TERM

    # 使用 shell 后台进程同时运行前后端，带日志前缀
    (cd backend && cargo watch -w src -x run) 2>&1 | sed $'s/^/\033[36m[Rust]\033[0m /' &
    (cd frontend && npm run dev) 2>&1 | sed $'s/^/\033[34m[Vite]\033[0m /' &

    wait
    ;;

  *)
    echo "❌ 无效选项，请输入 1 或 2"
    exit 1
    ;;
esac

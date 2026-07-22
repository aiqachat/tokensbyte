#!/bin/bash
# tokensbyte opensource
# (c) 2026 tokensbyte.ai
# @copyright      Copyright netbcloud/wstianxia 
# @license        MIT (https://www.tokensbyte.ai/)

# ──────────────────────────────────────────────────
# TokensByte 本地开发启动脚本
# - 默认后台：拉起后端口就绪即退出，进程继续跑
# - 前台日志：./dev.sh fg 或 DEV_ATTACH=1，终端刷日志，Ctrl+C 停本实例
# - 多实例：按路径哈希隔离 state；共用 Postgres；前后端端口避让
# - 仅回收本仓库残留进程，不误杀其它目录实例
# 可选环境变量：
#   PROJECT_NAME / BACKEND_PORT / FRONTEND_PORT / POSTGRES_PORT
#   DATABASE_URL / DEV_MODE(1|2) / RUST_LOG / DEV_WAIT_MAX / DEV_ATTACH
# 用法：./dev.sh [1|2] [bg|fg]   1=本地(默认后台)  2=Docker 全容器
# ──────────────────────────────────────────────────
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
cd "${ROOT_DIR}"

PROJECT_NAME=${PROJECT_NAME:-$(basename "$ROOT_DIR")}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-tokensapi}
PREFERRED_BACKEND_PORT=${BACKEND_PORT:-3000}
PREFERRED_FRONTEND_PORT=${FRONTEND_PORT:-5173}
DEV_ATTACH="${DEV_ATTACH:-0}"

choice=""
for arg in "$@"; do
    case "${arg}" in
        1|2) choice="${arg}" ;;
        fg|foreground|attach|log) DEV_ATTACH=1 ;;
        bg|background|daemon) DEV_ATTACH=0 ;;
        -h|--help|help)
            echo "用法: ./dev.sh [1|2] [bg|fg]"
            echo "  1 / 默认  本地开发（默认 bg 后台）"
            echo "  2         Docker 全容器"
            echo "  fg        前台输出日志，Ctrl+C 停止本实例"
            echo "  bg        后台运行（默认）"
            exit 0
            ;;
        *)
            echo "❌ 无效参数: ${arg}（可用: ./dev.sh [1|2] [bg|fg]）"
            exit 1
            ;;
    esac
done
choice="${choice:-${DEV_MODE:-1}}"

STATE_ID=$(printf '%s' "${ROOT_DIR}" | shasum -a 256 2>/dev/null | cut -c1-12)
[ -n "${STATE_ID}" ] || STATE_ID=$(printf '%s' "${ROOT_DIR}" | cksum | awk '{print $1}')
STATE_FILE="${TMPDIR:-/tmp}/tokensbyte-dev-${STATE_ID}.state"

port_in_use() {
    local port="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi
    if command -v python3 >/dev/null 2>&1; then
        if python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1', int('${port}'))); s.close()" >/dev/null 2>&1; then
            return 1
        fi
        return 0
    fi
    return 0
}

pick_free_port() {
    # 不可写成 local start=.. max=$((start+100))（同行 start 未生效，max 会变 100）
    local start="$1" label="$2" p="$1" max
    max=$((start + 100))
    while [ "${p}" -le "${max}" ]; do
        if ! port_in_use "${p}"; then
            [ "${p}" != "${start}" ] && echo "ℹ️  ${label} 端口 ${start} 已被占用，改用 ${p}" >&2
            echo "${p}"
            return 0
        fi
        p=$((p + 1))
    done
    echo "❌ 无法为 ${label} 找到可用端口（已尝试 ${start}-${max}）" >&2
    exit 1
}

hard_kill_pid() {
    local pid="$1"
    [ -n "${pid}" ] || return 0
    kill -0 "${pid}" 2>/dev/null || return 0
    kill -CONT "${pid}" 2>/dev/null || true
    kill -KILL "${pid}" 2>/dev/null || true
}

kill_tree() {
    local pid="$1" c
    [ -n "${pid}" ] || return 0
    kill -0 "${pid}" 2>/dev/null || return 0
    for c in $(pgrep -P "${pid}" 2>/dev/null || true); do
        kill_tree "${c}"
    done
    hard_kill_pid "${pid}"
}

free_listen_port() {
    local port="$1" pid
    [ -n "${port}" ] || return 0
    command -v lsof >/dev/null 2>&1 || return 0
    for pid in $(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true); do
        hard_kill_pid "${pid}"
    done
}

state_get() {
    [ -f "${STATE_FILE}" ] || return 0
    sed -n "s/^${1}=//p" "${STATE_FILE}" | head -n1
}

write_run_state() {
    printf 'BACKEND_PORT=%s\nFRONTEND_PORT=%s\nBACKEND_PID=%s\nFRONTEND_PID=%s\n' \
        "${BACKEND_PORT}" "${FRONTEND_PORT}" "${BACKEND_PID:-}" "${FRONTEND_PID:-}" > "${STATE_FILE}"
}

proc_cwd() {
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n1
}

kill_if_cwd() {
    local pid="$1" want="$2"
    [ -n "${pid}" ] && [ "${pid}" != "$$" ] || return 0
    [ "$(proc_cwd "${pid}")" = "${want}" ] || return 0
    hard_kill_pid "${pid}"
}

# 回收本仓库残留前后端（不影响其它目录实例 / 共享 Postgres）
reclaim_repo_services() {
    local pid cmd
    echo "🧹 清理本仓库残留的前后端占用..."

    if [ -f "${STATE_FILE}" ]; then
        kill_tree "$(state_get BACKEND_PID)"
        kill_tree "$(state_get FRONTEND_PID)"
        free_listen_port "$(state_get BACKEND_PORT)"
        free_listen_port "$(state_get FRONTEND_PORT)"
        rm -f "${STATE_FILE}"
    fi

    while read -r pid cmd; do
        [ -n "${pid}" ] || continue
        case "${cmd}" in
            *"${ROOT_DIR}/frontend"*|*"${ROOT_DIR}/backend"*) hard_kill_pid "${pid}" ;;
            *tokensbyte-server*) kill_if_cwd "${pid}" "${ROOT_DIR}/backend" ;;
            *cargo-watch*) kill_if_cwd "${pid}" "${ROOT_DIR}/backend" ;;
        esac
    done <<EOF
$(ps -axo pid= -o command= 2>/dev/null || true)
EOF
}

docker_pg_ready() {
    local cname="$1"
    [ -n "${cname}" ] || return 1
    docker exec "${cname}" pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1
}

# 多套开发环境共用同一 Postgres（优先已在跑的实例）
shared_pg_ready() {
    if command -v pg_isready >/dev/null 2>&1; then
        pg_isready -h 127.0.0.1 -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" >/dev/null 2>&1 && return 0
    fi
    local cname
    for cname in "tokensbyte-ws-postgres" "${PROJECT_NAME}-postgres" "tokensbyte-postgres"; do
        docker_pg_ready "${cname}" && return 0
    done
    docker_pg_ready "$(docker ps --filter "publish=${POSTGRES_PORT}" --format '{{.ID}}' 2>/dev/null | head -n1)"
}

wait_project_postgres() {
    local i
    for i in $(seq 1 30); do
        if docker_pg_ready "${PROJECT_NAME}-postgres"; then
            echo "✅ 数据库已就绪"
            return 0
        fi
        sleep 1
    done
    echo "❌ 数据库启动超时，请检查 Docker"
    exit 1
}

ensure_postgres() {
    export PROJECT_NAME POSTGRES_PORT POSTGRES_USER
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${PROJECT_NAME}}"

    if shared_pg_ready; then
        echo "✅ 复用本机 Postgres (port ${POSTGRES_PORT})"
        return 0
    fi

    echo "🐘 启动 Docker Postgres (${PROJECT_NAME}-postgres)..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
    echo "⏳ 等待数据库就绪..."
    wait_project_postgres
}

case "${choice}" in
  2)
    echo "🚀 正在启动 Docker 全容器开发环境..."
    export PROJECT_NAME
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${PROJECT_NAME}}"
    export BACKEND_PORT="$(pick_free_port "${PREFERRED_BACKEND_PORT}" "后端")"
    export FRONTEND_PORT="$(pick_free_port "${PREFERRED_FRONTEND_PORT}" "前端")"
    export POSTGRES_PORT="$(pick_free_port "${POSTGRES_PORT}" "数据库")"
    echo "   项目: ${PROJECT_NAME}"
    echo "   后端: http://localhost:${BACKEND_PORT}"
    echo "   前端: http://localhost:${FRONTEND_PORT}"
    echo "   数据库: localhost:${POSTGRES_PORT}"
    echo "   按 Ctrl+C 停止所有服务"
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
    ;;

  1|"")
    if [ "${DEV_ATTACH}" = "1" ]; then
        echo "🚀 正在前台启动本地开发环境（日志输出到本终端）..."
    else
        echo "🚀 正在后台启动本地开发环境..."
    fi
    echo "   项目: ${PROJECT_NAME}"

    reclaim_repo_services
    ensure_postgres

    if ! command -v cargo-watch >/dev/null 2>&1; then
        echo "⚠️ 未找到 cargo-watch，正在尝试自动安装..."
        cargo install cargo-watch
    fi

    if [ ! -d "frontend/node_modules" ]; then
        echo "📦 正在安装前端依赖 (使用国内镜像源)..."
        (cd frontend && npm install --registry=https://registry.npmmirror.com)
    fi

    BACKEND_PORT="$(pick_free_port "${PREFERRED_BACKEND_PORT}" "后端")"
    FRONTEND_PORT="$(pick_free_port "${PREFERRED_FRONTEND_PORT}" "前端")"
    export BACKEND_PORT FRONTEND_PORT
    export PORT="${BACKEND_PORT}"
    export HOST="${HOST:-0.0.0.0}"
    export DATABASE_URL="${DATABASE_URL:-postgres://tokensapi:tokensapi@localhost:${POSTGRES_PORT}/tokensapi}"
    export RUST_LOG="${RUST_LOG:-info}"
    export BASE_URL="${BASE_URL:-http://localhost:${BACKEND_PORT}}"
    export VITE_API_TARGET="http://127.0.0.1:${BACKEND_PORT}"
    export CARGO_INCREMENTAL="${CARGO_INCREMENTAL:-1}"

    echo "⚙️ 启动 Rust 服务 (watch, :${BACKEND_PORT})..."
    : > backend_dev.log
    BACKEND_ENV=(
        "PORT=${PORT}" "HOST=${HOST}" "DATABASE_URL=${DATABASE_URL}"
        "RUST_LOG=${RUST_LOG}" "BASE_URL=${BASE_URL}" "CARGO_INCREMENTAL=${CARGO_INCREMENTAL}"
    )
    [ -n "${CARGO_TARGET_DIR:-}" ] && BACKEND_ENV+=("CARGO_TARGET_DIR=${CARGO_TARGET_DIR}")
    nohup env "${BACKEND_ENV[@]}" \
        sh -c "cd backend && exec cargo watch -w src -w Cargo.toml -w Cargo.lock -w build.rs -x run" \
        > backend_dev.log 2>&1 &
    BACKEND_PID=$!
    disown "${BACKEND_PID}" 2>/dev/null || true

    echo "⚙️ 启动 Vite 服务 (:${FRONTEND_PORT})..."
    : > frontend_dev.log
    nohup env VITE_API_TARGET="${VITE_API_TARGET}" FRONTEND_PORT="${FRONTEND_PORT}" \
        sh -c "cd frontend && exec npm run dev -- --port ${FRONTEND_PORT} --strictPort --host 0.0.0.0" \
        > frontend_dev.log 2>&1 &
    FRONTEND_PID=$!
    disown "${FRONTEND_PID}" 2>/dev/null || true

    write_run_state

    LOG_FOLLOW_PIDS=""
    stop_log_follow() {
        local p
        for p in ${LOG_FOLLOW_PIDS}; do hard_kill_pid "${p}"; done
        LOG_FOLLOW_PIDS=""
    }

    follow_log() {
        local file="$1" prefix="$2"
        (
            tail -n 0 -F "${file}" 2>/dev/null | while IFS= read -r line; do
                printf '[%s] %s\n' "${prefix}" "${line}"
            done
        ) &
        LOG_FOLLOW_PIDS="${LOG_FOLLOW_PIDS} $!"
    }

    cleanup_attach() {
        stop_log_follow
        echo ""
        echo "🛑 正在停止本实例服务..."
        kill_tree "${BACKEND_PID}"
        kill_tree "${FRONTEND_PID}"
        free_listen_port "${BACKEND_PORT}"
        free_listen_port "${FRONTEND_PORT}"
        rm -f "${STATE_FILE}"
        echo "✅ 本实例已停止，端口已释放"
        exit 0
    }

    if [ "${DEV_ATTACH}" = "1" ]; then
        trap cleanup_attach INT TERM
        echo "📺 前台日志模式（Ctrl+C 停止本实例）"
        follow_log backend_dev.log Rust
        follow_log frontend_dev.log Vite
    fi

    WAIT_MAX=${DEV_WAIT_MAX:-600}
    echo "⏳ 等待后端 (${BACKEND_PORT}) 和前端 (${FRONTEND_PORT}) 就绪（最长 ${WAIT_MAX}s）..."
    backend_up=0
    frontend_up=0
    for i in $(seq 1 "${WAIT_MAX}"); do
        if [ "${backend_up}" -eq 0 ] && port_in_use "${BACKEND_PORT}"; then
            backend_up=1
            echo "✅ 后端已监听 :${BACKEND_PORT}"
        fi
        if [ "${frontend_up}" -eq 0 ] && port_in_use "${FRONTEND_PORT}"; then
            frontend_up=1
            echo "✅ 前端已监听 :${FRONTEND_PORT}"
        fi
        if [ "${backend_up}" -eq 1 ] && [ "${frontend_up}" -eq 1 ]; then
            echo "🎉 本地开发环境已就绪！"
            echo "   👉 项目: ${PROJECT_NAME}"
            echo "   👉 前端面板: http://localhost:${FRONTEND_PORT}"
            echo "   👉 后端 API: http://localhost:${BACKEND_PORT}"
            echo "   👉 数据库: localhost:${POSTGRES_PORT} (共享可复用)"
            echo "   (日志文件: backend_dev.log / frontend_dev.log)"
            if [ "${DEV_ATTACH}" = "1" ]; then
                echo "📺 持续输出日志中，按 Ctrl+C 停止本实例"
                while kill -0 "${BACKEND_PID}" 2>/dev/null || kill -0 "${FRONTEND_PID}" 2>/dev/null; do
                    sleep 1
                done
                cleanup_attach
            fi
            exit 0
        fi

        if [ "${DEV_ATTACH}" != "1" ] && [ $((i % 15)) -eq 0 ]; then
            tip=""
            if [ "${backend_up}" -eq 0 ]; then
                if kill -0 "${BACKEND_PID}" 2>/dev/null || pgrep -P "${BACKEND_PID}" >/dev/null 2>&1; then
                    tip="后端编译/启动中"
                else
                    tip="后端进程已退出，见 backend_dev.log"
                fi
                last="$(tail -n 1 backend_dev.log 2>/dev/null | tr -d '\r')"
                [ -n "${last}" ] && tip="${tip} | ${last}"
            fi
            [ "${frontend_up}" -eq 0 ] && tip="${tip:+${tip}；}前端未就绪"
            echo "… ${i}s / ${WAIT_MAX}s  ${tip}"
        fi
        sleep 1
    done

    echo "❌ 启动超时，请检查 backend_dev.log / frontend_dev.log"
    echo "   当前: 后端=$([ "${backend_up}" -eq 1 ] && echo 就绪 || echo 未就绪) 前端=$([ "${frontend_up}" -eq 1 ] && echo 就绪 || echo 未就绪)"
    [ "${DEV_ATTACH}" = "1" ] && cleanup_attach
    exit 1
    ;;

  *)
    echo "❌ 无效选项，请使用: ./dev.sh [1|2] [bg|fg]"
    exit 1
    ;;
esac

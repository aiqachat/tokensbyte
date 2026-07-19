#!/bin/bash
# PostgreSQL 16 -> 18.4 自动升级脚本 (Linux/Mac Bash)
# 用法: ./upgrade-postgres-18.sh
# 支持回滚: ./upgrade-postgres-18.sh --rollback

set -euo pipefail

BACKUP_FILE="tokensapi_pg16.dump"
BACKUP_VOLUME="tokensbyte_postgres-data-backup-18"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
COMPOSE_DEV_FILE="$PROJECT_DIR/docker-compose.dev.yml"

export PROJECT_NAME="tokensbyte-ws"
OLD_VOLUME="tokensbyte_postgres-data"
CONTAINER_NAME="tokensbyte-ws-postgres"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "${CYAN}\n>>> $1${NC}"; }
success() { echo -e "${GREEN}   $1${NC}"; }
error() { echo -e "${RED}   $1${NC}"; }

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        error "Docker 未运行，请先启动 Docker"
        exit 1
    fi
    success "Docker 运行正常"
}

get_postgres_version() {
    if grep -q 'image:.*postgres:16' "$COMPOSE_FILE"; then echo 16
    elif grep -q 'image:.*postgres:18.4' "$COMPOSE_FILE"; then echo 18
    else echo 0
    fi
}

# ==================== 回滚模式 ====================
if [ "${1:-}" = "--rollback" ]; then
    step "开始回滚到 PostgreSQL 16"

    if ! docker volume inspect "$BACKUP_VOLUME" > /dev/null 2>&1; then
        error "备份 volume 不存在，无法回滚"
        exit 1
    fi

    echo "🧹 清理前后端本地残留进程..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    pkill -f cargo-watch 2>/dev/null || true
    pkill -f tokensbyte-server 2>/dev/null || true

    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" down 2>/dev/null || true
    docker volume rm "$OLD_VOLUME" 2>/dev/null || true
    docker volume create "$OLD_VOLUME" > /dev/null
    docker run --rm -v "${OLD_VOLUME}:/source" -v "${BACKUP_VOLUME}:/backup" alpine cp -a /backup/. /source/ > /dev/null

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/postgres:18.4-alpine/postgres:16-alpine/g' "$COMPOSE_FILE"
        sed -i '' 's|- postgres-data:/var/lib/postgresql|- postgres-data:/var/lib/postgresql/data|g' "$COMPOSE_FILE"
    else
        sed -i 's/postgres:18.4-alpine/postgres:16-alpine/g' "$COMPOSE_FILE"
        sed -i 's|- postgres-data:/var/lib/postgresql|- postgres-data:/var/lib/postgresql/data|g' "$COMPOSE_FILE"
    fi

    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" up -d postgres > /dev/null
    sleep 5

    if docker exec "${CONTAINER_NAME}" pg_isready -U tokensapi > /dev/null 2>&1; then
        success "回滚成功！PostgreSQL 16 已恢复"
        echo "🔄 正在启动前后端开发环境..."
        ./local_restart.sh
    else
        error "回滚后数据库未就绪"
        exit 1
    fi
    exit 0
fi

# ==================== 升级模式 ====================
echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  PostgreSQL 16 -> 18.4 自动升级脚本${NC}"
echo -e "${CYAN}=========================================${NC}"

check_docker

CURRENT_VER=$(get_postgres_version)
if [ "$CURRENT_VER" -eq 18 ]; then
    success "当前已是 PostgreSQL 18.4，无需升级"
    exit 0
fi
if [ "$CURRENT_VER" -ne 16 ]; then
    error "检测到未知的 PostgreSQL 版本，请检查 docker-compose.yml"
    exit 1
fi
success "当前 PostgreSQL 版本: 16"

step "步骤 1/7: 确保 Postgres 运行并停止本地前后端开发服务"
# 确保数据库处于运行状态，才能安全 dump
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" up -d postgres > /dev/null
# 停止本地前后端服务，防止在 dump 期间有新数据写入
echo "🧹 正在清理 3000 和 5173 端口的本地开发进程..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
pkill -f cargo-watch 2>/dev/null || true
pkill -f tokensbyte-server 2>/dev/null || true
success "本地前后端服务已停止，postgres 容器保持运行"

step "步骤 2/7: 导出 PG16 数据"
retries=0
while [ $retries -lt 30 ]; do
    if docker exec "${CONTAINER_NAME}" pg_isready -U tokensapi > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
    retries=$((retries + 1))
done

if [ $retries -ge 30 ]; then
    error "PG16 容器响应超时，无法导出"
    exit 1
fi

# 直接在现有的 postgres 容器中执行备份
docker exec -t "${CONTAINER_NAME}" pg_dump -U tokensapi -d tokensapi -Fc -f /tmp/tokensapi_pg16.dump
docker cp "${CONTAINER_NAME}":/tmp/tokensapi_pg16.dump "$PROJECT_DIR/$BACKUP_FILE"

SIZE=$(du -k "$PROJECT_DIR/$BACKUP_FILE" | cut -f1)
success "数据导出完成: $BACKUP_FILE (${SIZE} KB)"

step "步骤 3/7: 停止所有容器并备份旧 volume"
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" down > /dev/null
docker volume rm "$BACKUP_VOLUME" 2>/dev/null || true
docker volume create "$BACKUP_VOLUME" > /dev/null
docker run --rm -v "${OLD_VOLUME}:/source" -v "${BACKUP_VOLUME}:/backup" alpine cp -a /source/. /backup/ > /dev/null
success "旧 volume 已备份到 $BACKUP_VOLUME"

docker volume rm "$OLD_VOLUME" > /dev/null
success "旧 volume 已删除"

step "步骤 4/7: 升级 docker-compose.yml 到 PG18.4"
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/postgres:16-alpine/postgres:18.4-alpine/g' "$COMPOSE_FILE"
    sed -i '' 's|- postgres-data:/var/lib/postgresql/data|- postgres-data:/var/lib/postgresql|g' "$COMPOSE_FILE"
else
    sed -i 's/postgres:16-alpine/postgres:18.4-alpine/g' "$COMPOSE_FILE"
    sed -i 's|- postgres-data:/var/lib/postgresql/data|- postgres-data:/var/lib/postgresql|g' "$COMPOSE_FILE"
fi
success "docker-compose.yml 已更新为 postgres:18.4-alpine"

step "步骤 5/7: 启动 PostgreSQL 18.4"
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" up -d postgres > /dev/null

retries=0
while [ $retries -lt 30 ]; do
    if docker exec "${CONTAINER_NAME}" pg_isready -U tokensapi > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
    retries=$((retries + 1))
done

if [ $retries -ge 30 ]; then
    error "PG18.4 启动超时"
    exit 1
fi
success "PostgreSQL 18.4 已就绪"

step "步骤 6/7: 恢复数据到 PG18.4"
docker cp "$PROJECT_DIR/$BACKUP_FILE" "${CONTAINER_NAME}":/tmp/tokensapi_pg18.dump
docker exec -t "${CONTAINER_NAME}" pg_restore \
    -U tokensapi -d tokensapi --clean --if-exists --no-owner --no-privileges /tmp/tokensapi_pg18.dump > /dev/null || true

# 验证数据
USERS=$(docker exec -t "${CONTAINER_NAME}" psql -U tokensapi -d tokensapi \
    -c "SELECT COUNT(*) FROM users;" 2>/dev/null | grep -o '[0-9]\+' | head -1 || echo "0")
success "数据恢复完成 (users: $USERS 行)"

step "步骤 7/7: 重新拉起前后端服务并验证"
./local_restart.sh

sleep 5

# 检查健康状态
BACKEND_HEALTH=$(curl -sI http://localhost:3000/api/health | head -n 1 || true)
FRONTEND_HEALTH=$(curl -sI http://localhost:5173/ | head -n 1 || true)

if echo "$BACKEND_HEALTH" | grep -q "200" && echo "$FRONTEND_HEALTH" | grep -q "200"; then
    success "backend health check: $BACKEND_HEALTH"
    success "frontend health check: $FRONTEND_HEALTH"
else
    error "服务健康检查未通过"
    error "backend: $BACKEND_HEALTH"
    error "frontend: $FRONTEND_HEALTH"
    exit 1
fi

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  PostgreSQL 16 -> 18.4 升级成功！${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "${NC}  前端: http://localhost:5173${NC}"
echo -e "${NC}  后端: http://localhost:3000${NC}"
echo -e "${YELLOW}\n  如需回滚，请运行:${NC}"
echo -e "${YELLOW}    ./upgrade-postgres-18.sh --rollback${NC}"
echo -e "${GREEN}=========================================${NC}"

# 清理宿主机临时 dump 文件
rm -f "$PROJECT_DIR/$BACKUP_FILE"

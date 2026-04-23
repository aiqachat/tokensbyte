#!/bin/bash
# PostgreSQL 15 -> 16 自动升级脚本 (Linux/Mac Bash)
# 用法: ./upgrade-postgres.sh
# 支持回滚: ./upgrade-postgres.sh --rollback

set -euo pipefail

BACKUP_FILE="tokensapi_pg15.dump"
BACKUP_VOLUME="tokensbyte_postgres-data-backup"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
COMPOSE_DEV_FILE="$PROJECT_DIR/docker-compose.dev.yml"

# 自动推导真实的 Volume 名字
COMPOSE_PROJ=$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')
OLD_VOLUME="${COMPOSE_PROJ}_postgres-data"

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
    if grep -q 'image:.*postgres:15' "$COMPOSE_FILE"; then echo 15
    elif grep -q 'image:.*postgres:16' "$COMPOSE_FILE"; then echo 16
    else echo 0
    fi
}

# ==================== 回滚模式 ====================
if [ "${1:-}" = "--rollback" ]; then
    step "开始回滚到 PostgreSQL 15"

    if ! docker volume inspect "$BACKUP_VOLUME" > /dev/null 2>&1; then
        error "备份 volume 不存在，无法回滚"
        exit 1
    fi

    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" down 2>/dev/null || true
    docker volume rm "$OLD_VOLUME" 2>/dev/null || true
    docker volume create "$OLD_VOLUME" > /dev/null
    docker run --rm -v "${OLD_VOLUME}:/source" -v "${BACKUP_VOLUME}:/backup" alpine cp -a /backup/. /source/ > /dev/null

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/postgres:16-alpine/postgres:15-alpine/g' "$COMPOSE_FILE"
    else
        sed -i 's/postgres:16-alpine/postgres:15-alpine/g' "$COMPOSE_FILE"
    fi

    docker compose -f "$COMPOSE_FILE" up -d postgres > /dev/null
    sleep 5

    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U tokensapi > /dev/null 2>&1; then
        success "回滚成功！PostgreSQL 15 已恢复"
    else
        error "回滚后数据库未就绪"
        exit 1
    fi
    exit 0
fi

# ==================== 升级模式 ====================
echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  PostgreSQL 15 -> 16 自动升级脚本${NC}"
echo -e "${CYAN}=========================================${NC}"

check_docker

CURRENT_VER=$(get_postgres_version)
if [ "$CURRENT_VER" -eq 16 ]; then
    success "当前已是 PostgreSQL 16，无需升级"
    exit 0
fi
if [ "$CURRENT_VER" -ne 15 ]; then
    error "检测到未知的 PostgreSQL 版本，请检查 docker-compose.yml"
    exit 1
fi
success "当前 PostgreSQL 版本: 15"

step "步骤 1/7: 确保 Postgres 运行并停止其他服务"
# 确保数据库处于运行状态，才能安全 dump
docker compose -f "$COMPOSE_FILE" up -d postgres > /dev/null
# 停止后端和前端，防止在 dump 期间有新数据写入
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" stop backend frontend > /dev/null
success "backend 和 frontend 已停止，postgres 保持运行"

step "步骤 2/7: 导出 PG15 数据"
retries=0
while [ $retries -lt 30 ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U tokensapi > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
    retries=$((retries + 1))
done

if [ $retries -ge 30 ]; then
    error "PG15 容器响应超时，无法导出"
    exit 1
fi

# 直接在现有的 postgres 容器中执行备份，避免文件挂载冲突
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U tokensapi -d tokensapi -Fc -f /tmp/tokensapi.dump
docker cp tokensbyte-postgres:/tmp/tokensapi.dump "$PROJECT_DIR/$BACKUP_FILE"

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

step "步骤 4/7: 升级 docker-compose.yml 到 PG16"
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/postgres:15-alpine/postgres:16-alpine/g' "$COMPOSE_FILE"
else
    sed -i 's/postgres:15-alpine/postgres:16-alpine/g' "$COMPOSE_FILE"
fi
success "docker-compose.yml 已更新为 postgres:16-alpine"

step "步骤 5/7: 启动 PostgreSQL 16"
docker compose -f "$COMPOSE_FILE" up -d postgres > /dev/null

retries=0
while [ $retries -lt 30 ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U tokensapi > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
    retries=$((retries + 1))
done

if [ $retries -ge 30 ]; then
    error "PG16 启动超时"
    exit 1
fi
success "PostgreSQL 16 已就绪"

step "步骤 6/7: 恢复数据到 PG16"
docker cp "$PROJECT_DIR/$BACKUP_FILE" tokensbyte-postgres:/tmp/tokensapi.dump
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_restore \
    -U tokensapi -d tokensapi --clean --if-exists --no-owner --no-privileges /tmp/tokensapi.dump > /dev/null || true

# 验证数据
USERS=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U tokensapi -d tokensapi \
    -c "SELECT COUNT(*) FROM users;" 2>/dev/null | grep -o '[0-9]\+' | head -1 || echo "0")
success "数据恢复完成 (users: $USERS 行)"

step "步骤 7/7: 启动全部服务并验证"
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" up -d > /dev/null

sleep 10

# 检查健康状态
BACKEND_HEALTH=$(docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" ps backend --format "{{.Status}}" | head -1)
POSTGRES_HEALTH=$(docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_DEV_FILE" ps postgres --format "{{.Status}}" | head -1)

if echo "$BACKEND_HEALTH" | grep -q "healthy" && echo "$POSTGRES_HEALTH" | grep -q "healthy"; then
    success "backend: $BACKEND_HEALTH"
    success "postgres: $POSTGRES_HEALTH"
else
    error "服务健康检查未通过"
    error "backend: $BACKEND_HEALTH"
    error "postgres: $POSTGRES_HEALTH"
    exit 1
fi

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  PostgreSQL 15 -> 16 升级成功！${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "${NC}  前端: http://localhost:5173${NC}"
echo -e "${NC}  后端: http://localhost:3000${NC}"
echo -e "${YELLOW}\n  如需回滚，请运行:${NC}"
echo -e "${YELLOW}    ./upgrade-postgres.sh --rollback${NC}"
echo -e "${GREEN}=========================================${NC}"

# 清理临时文件
rm -f "$PROJECT_DIR/$BACKUP_FILE"

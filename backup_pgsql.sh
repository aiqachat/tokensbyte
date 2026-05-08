#!/bin/bash

# PostgreSQL Docker备份脚本
# 功能：备份Docker容器中运行的PostgreSQL数据库，压缩存储并自动管理备份文件

########################## 配置项 - 请根据实际情况修改 ##########################
# Docker容器名称
DOCKER_CONTAINER_NAME="pgsql"
# 数据库用户名
DB_USER="postgres"
# 数据库密码（留空则使用容器默认认证方式）
DB_PASSWORD=""
# 数据库名称
DB_NAME="postgres"
# 备份文件保留天数（0表示不自动删除）
RETENTION_DAYS=7
##############################################################################

# 获取脚本所在绝对路径
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
# 备份文件存储目录
BACKUP_DIR="${SCRIPT_DIR}/backup"
# 备份文件名称（带时间戳）
BACKUP_FILENAME="pgsql_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
# 备份文件完整路径
BACKUP_FULL_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# 初始化备份目录
init_backup_dir() {
    if [ ! -d "${BACKUP_DIR}" ]; then
        mkdir -p "${BACKUP_DIR}"
        echo "已创建备份目录: ${BACKUP_DIR}"
    fi
}

# 执行数据库备份
perform_backup() {
    echo "开始备份数据库: ${DB_NAME} (容器: ${DOCKER_CONTAINER_NAME})"
    
    # 调用Docker容器中的pg_dump命令，直接压缩输出到本地文件
    if [ -n "${DB_PASSWORD}" ]; then
        # 配置密码环境变量
        docker exec -e PGPASSWORD="${DB_PASSWORD}" "${DOCKER_CONTAINER_NAME}" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FULL_PATH}"
    else
        # 无密码模式（使用容器默认trust认证）
        docker exec "${DOCKER_CONTAINER_NAME}" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FULL_PATH}"
    fi
    
    # 检查备份是否成功
    if [ $? -eq 0 ] && [ -s "${BACKUP_FULL_PATH}" ]; then
        echo "备份成功，文件已保存至: ${BACKUP_FULL_PATH}"
        echo "文件大小: $(du -h "${BACKUP_FULL_PATH}" | cut -f1)"
    else
        echo "备份失败，请检查配置参数和Docker容器状态"
        rm -f "${BACKUP_FULL_PATH}" 2>/dev/null
        exit 1
    fi
}

# 清理过期备份
clean_expired_backups() {
    if [ "${RETENTION_DAYS}" -gt 0 ]; then
        echo "清理${RETENTION_DAYS}天前的过期备份..."
        find "${BACKUP_DIR}" -name "pgsql_backup_*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -delete
        echo "过期备份清理完成"
    fi
}

# 主函数
main() {
    init_backup_dir
    perform_backup
    clean_expired_backups
    echo "备份任务全部完成"
}

# 执行主函数
main

# PostgreSQL 15 -> 16 自动升级脚本 (Windows PowerShell)
# 用法: .\upgrade-postgres.ps1
# 支持回滚: .\upgrade-postgres.ps1 -Rollback

param(
    [switch]$Rollback
)

$ErrorActionPreference = "Stop"
$BackupFile = "tokensapi_pg15.dump"
$OldVolume = "tokensbyte_postgres-data"
$BackupVolume = "tokensbyte_postgres-data-backup"
$ProjectDir = $PSScriptRoot
$ComposeFile = "$ProjectDir\docker-compose.yml"
$ComposeDevFile = "$ProjectDir\docker-compose.dev.yml"

function Write-Step {
    param([string]$Message)
    Write-Host "`n>>> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "   $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "   $Message" -ForegroundColor Red
}

function Test-DockerRunning {
    try {
        docker info > $null 2>&1
        return $true
    } catch {
        return $false
    }
}

function Get-PostgresImage {
    $content = Get-Content $ComposeFile -Raw
    if ($content -match 'image:\s*postgres:15') { return 15 }
    if ($content -match 'image:\s*postgres:16') { return 16 }
    return 0
}

# ==================== 回滚模式 ====================
if ($Rollback) {
    Write-Step "开始回滚到 PostgreSQL 15"
    
    $volExists = docker volume inspect $BackupVolume 2>$null
    if (-not $volExists) {
        Write-Error "备份 volume 不存在，无法回滚"
        exit 1
    }
    
    docker compose -f $ComposeFile -f $ComposeDevFile down 2>$null | Out-Null
    docker volume rm $OldVolume 2>$null | Out-Null
    docker volume create $OldVolume | Out-Null
    docker run --rm -v ${BackupVolume}:/source -v ${OldVolume}:/backup alpine cp -a /source/. /backup/ | Out-Null
    
    (Get-Content $ComposeFile) -replace 'postgres:16-alpine', 'postgres:15-alpine' | Set-Content $ComposeFile -Encoding UTF8
    
    docker compose -f $ComposeFile -f $ComposeDevFile up -d postgres | Out-Null
    Start-Sleep -Seconds 5
    
    $ready = docker compose -f $ComposeFile -f $ComposeDevFile exec -T postgres pg_isready -U tokensapi 2>$null
    if ($ready -match "accepting") {
        Write-Success "回滚成功！PostgreSQL 15 已恢复"
    } else {
        Write-Error "回滚后数据库未就绪"
        exit 1
    }
    exit 0
}

# ==================== 升级模式 ====================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  PostgreSQL 15 -> 16 自动升级脚本" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 检查 Docker
if (-not (Test-DockerRunning)) {
    Write-Error "Docker 未运行，请先启动 Docker Desktop"
    exit 1
}
Write-Success "Docker 运行正常"

# 检查当前版本
$currentVer = Get-PostgresImage
if ($currentVer -eq 16) {
    Write-Success "当前已是 PostgreSQL 16，无需升级"
    exit 0
}
if ($currentVer -ne 15) {
    Write-Error "检测到未知的 PostgreSQL 版本，请检查 docker-compose.yml"
    exit 1
}
Write-Success "当前 PostgreSQL 版本: 15"

# 检查容器运行状态
$containers = docker compose -f $ComposeFile -f $ComposeDevFile ps --format json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $containers) {
    Write-Error "容器未运行，请先启动项目"
    exit 1
}

Write-Step "步骤 1/7: 停止 backend/frontend（保留 postgres 运行）"
docker compose -f $ComposeFile -f $ComposeDevFile stop backend frontend | Out-Null
Write-Success "backend 和 frontend 已停止"

Write-Step "步骤 2/7: 导出 PG15 数据"
$tempContainer = "pg15-temp-export"
docker run -d --name $tempContainer `
    -v ${OldVolume}:/var/lib/postgresql/data `
    -e POSTGRES_USER=tokensapi `
    -e POSTGRES_PASSWORD=tokensapi `
    -e POSTGRES_DB=tokensapi `
    postgres:15-alpine > $null 2>&1

# 等待数据库就绪
$retries = 0
while ($retries -lt 30) {
    $ready = docker exec $tempContainer pg_isready -U tokensapi 2>$null
    if ($ready -match "accepting") { break }
    Start-Sleep -Milliseconds 500
    $retries++
}

if ($retries -ge 30) {
    Write-Error "临时 PG15 容器启动超时"
    docker rm -f $tempContainer 2>$null | Out-Null
    exit 1
}

# 执行 pg_dump
docker exec $tempContainer pg_dump -U tokensapi -d tokensapi -Fc -f /tmp/tokensapi.dump
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump 导出失败"
    docker rm -f $tempContainer 2>$null | Out-Null
    exit 1
}

# 复制到宿主机
docker cp ${tempContainer}:/tmp/tokensapi.dump "$ProjectDir\$BackupFile"
docker stop $tempContainer | Out-Null
docker rm $tempContainer | Out-Null

$size = [math]::Round((Get-Item "$ProjectDir\$BackupFile").Length / 1KB, 2)
Write-Success "数据导出完成: $BackupFile (${size} KB)"

Write-Step "步骤 3/7: 停止所有容器并备份旧 volume"
docker compose -f $ComposeFile -f $ComposeDevFile down | Out-Null
docker volume rm $BackupVolume 2>$null | Out-Null
docker volume create $BackupVolume | Out-Null
docker run --rm -v ${OldVolume}:/source -v ${BackupVolume}:/backup alpine cp -a /source/. /backup/ | Out-Null
Write-Success "旧 volume 已备份到 $BackupVolume"

docker volume rm $OldVolume | Out-Null
Write-Success "旧 volume 已删除"

Write-Step "步骤 4/7: 升级 docker-compose.yml 到 PG16"
(Get-Content $ComposeFile) -replace 'postgres:15-alpine', 'postgres:16-alpine' | Set-Content $ComposeFile -Encoding UTF8
Write-Success "docker-compose.yml 已更新为 postgres:16-alpine"

Write-Step "步骤 5/7: 启动 PostgreSQL 16"
docker compose -f $ComposeFile up -d postgres | Out-Null

$retries = 0
while ($retries -lt 30) {
    $ready = docker compose -f $ComposeFile exec -T postgres pg_isready -U tokensapi 2>$null
    if ($ready -match "accepting") { break }
    Start-Sleep -Milliseconds 500
    $retries++
}

if ($retries -ge 30) {
    Write-Error "PG16 启动超时"
    exit 1
}
Write-Success "PostgreSQL 16 已就绪"

Write-Step "步骤 6/7: 恢复数据到 PG16"
docker cp "$ProjectDir\$BackupFile" tokensbyte-postgres:/tmp/tokensapi.dump
docker compose -f $ComposeFile exec -T postgres pg_restore `
    -U tokensapi -d tokensapi --no-owner --no-privileges /tmp/tokensapi.dump | Out-Null

# 验证数据
$users = docker compose -f $ComposeFile exec -T postgres psql -U tokensapi -d tokensapi `
    -c "SELECT COUNT(*) FROM users;" 2>$null | Select-String -Pattern "\d+" | Select-Object -First 1
Write-Success "数据恢复完成 (users: $users 行)"

Write-Step "步骤 7/7: 启动全部服务并验证"
$env:FRONTEND_PORT = "5173"
docker compose -f $ComposeFile -f $ComposeDevFile up -d | Out-Null

Start-Sleep -Seconds 10

# 检查健康状态
$backendHealth = docker compose -f $ComposeFile -f $ComposeDevFile ps backend --format "{{.Status}}"
$postgresHealth = docker compose -f $ComposeFile -f $ComposeDevFile ps postgres --format "{{.Status}}"

if ($backendHealth -match "healthy" -and $postgresHealth -match "healthy") {
    Write-Success "backend: $backendHealth"
    Write-Success "postgres: $postgresHealth"
} else {
    Write-Error "服务健康检查未通过"
    Write-Error "backend: $backendHealth"
    Write-Error "postgres: $postgresHealth"
    exit 1
}

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "  PostgreSQL 15 -> 16 升级成功！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  前端: http://localhost:5173" -ForegroundColor White
Write-Host "  后端: http://localhost:3000" -ForegroundColor White
Write-Host "`n  如需回滚，请运行:" -ForegroundColor Yellow
Write-Host "    .\scripts\upgrade-postgres.ps1 -Rollback" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Green

# 清理临时文件
Remove-Item "$ProjectDir\$BackupFile" -ErrorAction SilentlyContinue

# TokensByte Docker 镜像导出脚本 (Windows PowerShell)
# 在本地构建并导出镜像，用于上传到云服务器

$ErrorActionPreference = "Stop"

$OutputDir = ".\docker-images"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  TokensByte Docker 镜像导出脚本" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Docker 是否安装
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker 版本: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 错误: 未找到 Docker，请先安装 Docker Desktop" -ForegroundColor Red
    Write-Host "   访问: https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host ""

# 创建输出目录
if (-Not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host "📦 开始构建 Docker 镜像..." -ForegroundColor Cyan
Write-Host ""

# 构建镜像
docker compose build

# 检查构建结果
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 镜像构建失败！" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "✅ 镜像构建完成！" -ForegroundColor Green
Write-Host ""

# 获取镜像信息
Write-Host "📋 镜像信息:" -ForegroundColor Cyan
docker compose images

# 使用固定镜像名
$BackendImage = "tokensbyte-backend:latest"
$FrontendImage = "tokensbyte-frontend:latest"

# 验证镜像是否存在
$backendExists = docker images -q $BackendImage
$frontendExists = docker images -q $FrontendImage
if (-not $backendExists -or -not $frontendExists) {
    Write-Host "❌ 镜像未找到，构建可能失败！" -ForegroundColor Red
    Write-Host "   后端镜像: $(if($backendExists){'✅ 存在'}else{'❌ 缺失'})" -ForegroundColor $(if($backendExists){'Green'}else{'Red'})
    Write-Host "   前端镜像: $(if($frontendExists){'✅ 存在'}else{'❌ 缺失'})" -ForegroundColor $(if($frontendExists){'Green'}else{'Red'})
    pause
    exit 1
}

Write-Host ""

# 导出镜像
Write-Host "📤 开始导出镜像..." -ForegroundColor Cyan
Write-Host ""

# 导出后端镜像
$BackendFile = "$OutputDir\tokensbyte-backend-$Timestamp.tar"
Write-Host "  → 导出后端镜像到: $BackendFile" -ForegroundColor Yellow
docker save -o $BackendFile $BackendImage
$BackendSize = (Get-Item $BackendFile).Length
Write-Host "    大小: $([math]::Round($BackendSize / 1MB, 2)) MB" -ForegroundColor Gray

# 导出前端镜像
$FrontendFile = "$OutputDir\tokensbyte-frontend-$Timestamp.tar"
Write-Host "  → 导出前端镜像到: $FrontendFile" -ForegroundColor Yellow
docker save -o $FrontendFile $FrontendImage
$FrontendSize = (Get-Item $FrontendFile).Length
Write-Host "    大小: $([math]::Round($FrontendSize / 1MB, 2)) MB" -ForegroundColor Gray

Write-Host ""
Write-Host "💡 提示: PostgreSQL 是官方镜像，服务器部署时会自动从 Docker Hub 拉取" -ForegroundColor Yellow

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  导出完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 显示文件列表
Write-Host "📁 导出文件列表:" -ForegroundColor Cyan
Get-ChildItem "$OutputDir\*$Timestamp.tar" | Format-Table Name, @{Label="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}} -AutoSize

# 计算总大小
$TotalSize = (Get-ChildItem "$OutputDir\*$Timestamp.tar" | Measure-Object -Property Length -Sum).Sum
Write-Host "📊 总大小: $([math]::Round($TotalSize / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# 生成导入脚本 (Linux/Mac)
$ImportScriptBash = @'
#!/bin/bash

# TokensByte Docker 镜像导入脚本 (Linux/Mac)
# 在云服务器上运行此脚本导入镜像

set -e

echo "========================================="
echo "  TokensByte Docker 镜像导入脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo ""

# 查找所有 tar 文件
tar_files=$(ls *.tar 2>/dev/null || true)

if [ -z "$tar_files" ]; then
    echo "❌ 错误: 当前目录未找到 .tar 镜像文件"
    echo "   请将导出的镜像文件上传到此目录"
    exit 1
fi

echo "📥 开始导入镜像..."
echo ""

# 导入每个镜像文件
for tar_file in *.tar; do
    if [ -f "$tar_file" ]; then
        echo "  → 导入: $tar_file"
        docker load -i "$tar_file"
        echo ""
    fi
done

echo "✅ 所有镜像导入完成！"
echo ""
echo "💡 提示: PostgreSQL 镜像将在启动时自动从 Docker Hub 拉取"
echo ""

echo "========================================="
echo "  后续步骤"
echo "========================================="
echo ""
echo "1. 上传 docker-compose.yml 到服务器"
echo "2. 创建 .env 配置文件 (运行 deploy.sh 会自动引导配置)"
echo "3. 启动服务:"
echo "   docker compose up -d"
echo ""
echo "或者直接使用部署脚本:"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
'@

$ImportScriptBash | Out-File -FilePath "$OutputDir\import-images.sh" -Encoding UTF8
Write-Host "✅ 已生成 Linux/Mac 导入脚本: $OutputDir\import-images.sh" -ForegroundColor Green

# 生成导入脚本 (Windows)
$ImportScriptPs = @"
# TokensByte Docker 镜像导入脚本 (Windows PowerShell)
# 在云服务器上运行此脚本导入镜像

`$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  TokensByte Docker 镜像导入脚本" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Docker 是否安装
try {
    `$dockerVersion = docker --version
    Write-Host "✅ Docker 版本: `$dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 错误: 未找到 Docker" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 查找所有 tar 文件
`$TarFiles = Get-ChildItem -Filter "*.tar" -ErrorAction SilentlyContinue

if (-not `$TarFiles) {
    Write-Host "❌ 错误: 当前目录未找到 .tar 镜像文件" -ForegroundColor Red
    Write-Host "   请将导出的镜像文件上传到此目录" -ForegroundColor Yellow
    exit 1
}

Write-Host "📥 开始导入镜像..." -ForegroundColor Cyan
Write-Host ""

# 导入每个镜像文件
foreach (`$tarFile in `$TarFiles) {
    Write-Host "  → 导入: `$(`$tarFile.Name)" -ForegroundColor Yellow
    docker load -i `$tarFile.FullName
    Write-Host ""
}

Write-Host "✅ 所有镜像导入完成！" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示: PostgreSQL 镜像将在启动时自动从 Docker Hub 拉取" -ForegroundColor Yellow
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  后续步骤" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. 上传 docker-compose.yml 到服务器"
Write-Host "2. 创建 .env 配置文件 (运行 deploy.ps1 会自动引导配置)"
Write-Host "3. 启动服务:"
Write-Host "   docker compose up -d"
Write-Host ""
Write-Host "或者直接使用部署脚本:"
Write-Host "   .\deploy.ps1"
Write-Host ""
"@

$ImportScriptPs | Out-File -FilePath "$OutputDir\import-images.ps1" -Encoding UTF8
Write-Host "✅ 已生成 Windows 导入脚本: $OutputDir\import-images.ps1" -ForegroundColor Green
Write-Host ""

# 生成传输说明
$UploadGuide = @"
========================================
  TokensByte 镜像上传指南
========================================

📦 导出时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

📁 需要上传的文件:
$(Get-ChildItem "$OutputDir\*$Timestamp.tar" | ForEach-Object { $_.Name })
- import-images.ps1 (导入脚本)
- docker-compose.yml (部署配置)
- .env.example (环境变量模板)

📊 总大小: $([math]::Round($TotalSize / 1MB, 2)) MB

========================================
  上传方法
========================================

方法一: 使用 WinSCP (推荐)
----------------------
1. 下载并安装 WinSCP: https://winscp.net
2. 连接到服务器
3. 上传以下文件到服务器目录 (如 /opt/tokensbyte/):
   - 所有 .tar 文件
   - import-images.ps1
   - docker-compose.yml
   - .env.example


方法二: 使用 scp (如果有 OpenSSH)
----------------------
# 在 PowerShell 中执行
scp .\docker-images\*.tar your-user@your-server:/path/to/deploy/
scp .\docker-images\import-images.ps1 your-user@your-server:/path/to/deploy/
scp docker-compose.yml your-user@your-server:/path/to/deploy/
scp .env.example your-user@your-server:/path/to/deploy/

示例:
scp .\docker-images\*.tar root@192.168.1.100:/opt/tokensbyte/
scp .\docker-images\import-images.ps1 root@192.168.1.100:/opt/tokensbyte/
scp docker-compose.yml root@192.168.1.100:/opt/tokensbyte/
scp .env.example root@192.168.1.100:/opt/tokensbyte/


方法三: 使用云存储 (大文件推荐)
----------------------
1. 压缩文件:
   Compress-Archive -Path ".\docker-images\*$Timestamp.tar" -DestinationPath ".\docker-images\tokensbyte-images-$Timestamp.zip"

2. 上传到网盘/OSS

3. 在服务器下载并解压:
   wget <download-url>
   unzip tokensbyte-images-$Timestamp.zip

========================================
  服务器部署步骤
========================================

1. SSH 登录到服务器:
   ssh your-user@your-server

2. 进入部署目录:
   cd /path/to/deploy

3. 导入镜像:
   chmod +x import-images.sh
   ./import-images.sh
   # 或者如果使用 PowerShell Core:
   pwsh import-images.ps1

4. 创建环境变量文件:
   cp .env.example .env
   nano .env  # 编辑配置

5. 启动服务:
   docker compose up -d

6. 查看状态:
   docker compose ps
   docker compose logs -f

========================================
  使用外部数据库
========================================

如需使用外部 PostgreSQL (RDS/云数据库):
1. 修改 .env 中的 DATABASE_URL 指向外部数据库
   例: DATABASE_URL=postgres://user:pass@db.example.com:5432/tokensbyte
2. 注释掉 docker-compose.yml 中的 postgres 服务
3. 删除 backend 的 depends_on: postgres
4. 启动: docker compose up -d

========================================
  注意事项
========================================

⚠️  确保服务器已安装 Docker 和 Docker Compose
⚠️  生产环境必须修改 .env 中的默认密码
⚠️  建议配置防火墙仅开放 80/443 端口
⚠️  定期备份数据库数据卷

========================================

"@

$UploadGuide | Out-File -FilePath "$OutputDir\UPLOAD-GUIDE.txt" -Encoding UTF8
Write-Host "✅ 已生成上传指南: $OutputDir\UPLOAD-GUIDE.txt" -ForegroundColor Green
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  总结" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 导出文件:" -ForegroundColor Cyan
Write-Host "   目录: $OutputDir\"
Write-Host "   文件数: $((Get-ChildItem "$OutputDir\*$Timestamp.tar").Count) 个镜像"
Write-Host "   总大小: $([math]::Round($TotalSize / 1MB, 2)) MB"
Write-Host ""
Write-Host "📤 下一步:" -ForegroundColor Cyan
Write-Host "   1. 查看上传指南: Get-Content $OutputDir\UPLOAD-GUIDE.txt"
Write-Host "   2. 上传文件到服务器 (参考 UPLOAD-GUIDE.txt)"
Write-Host "   3. 在服务器运行: ./import-images.sh"
Write-Host "   4. 启动服务: docker compose up -d"
Write-Host ""
Write-Host "💡 提示: 可以使用压缩减小传输体积" -ForegroundColor Yellow
Write-Host "   Compress-Archive -Path .\docker-images\*.tar -DestinationPath .\docker-images\tokensbyte-images.zip"
Write-Host ""

pause

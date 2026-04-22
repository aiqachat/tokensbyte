# TokensByte 快速部署脚本 (Windows PowerShell)
# 右键使用 PowerShell 运行

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  TokensByte Docker 部署脚本" -ForegroundColor Cyan
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

# 检查 Docker Compose 是否安装
try {
    $composeVersion = docker compose version
    Write-Host "✅ Docker Compose 版本: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 错误: Docker Compose 不可用" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# 检查 .env 文件是否存在
if (-Not (Test-Path ".env")) {
    Write-Host "⚠️  未找到 .env 文件" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📝 开始配置环境变量..." -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 引导用户配置
    Write-Host "1️⃣  PostgreSQL 数据库密码" -ForegroundColor Cyan
    Write-Host "   (用于保护数据库，建议使用强密码)" -ForegroundColor Gray
    # 自动生成强密码 (16位，包含大小写字母、数字、特殊字符)
    $specialChars = '!@#$%^&*'
    $lowerCase = 'abcdefghijklmnopqrstuvwxyz'
    $upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    $digits = '0123456789'
    
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $passwordBytes = New-Object byte[] 16
    $password = @()
    
    # 确保每种类型至少一个字符
    $rng.GetBytes($passwordBytes)
    $password += $specialChars[$passwordBytes[0] % $specialChars.Length]
    $password += $lowerCase[$passwordBytes[1] % $lowerCase.Length]
    $password += $upperCase[$passwordBytes[2] % $upperCase.Length]
    $password += $digits[$passwordBytes[3] % $digits.Length]
    
    # 剩余字符随机选择
    $allChars = $specialChars + $lowerCase + $upperCase + $digits
    for ($i = 4; $i -lt 16; $i++) {
        $rng.GetBytes($passwordBytes)
        $password += $allChars[$passwordBytes[0] % $allChars.Length]
    }
    
    $rng.Dispose()
    $postgres_password = -join ($password | Sort-Object { Get-Random })
    Write-Host "   ✅ 已自动生成强密码 (16位)" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "2️⃣  JWT 密钥" -ForegroundColor Cyan
    Write-Host "   (用于用户认证，生产环境必须修改)" -ForegroundColor Gray
    # 自动生成随机密钥
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $jwt_secret = -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
    Write-Host "   ✅ 已自动生成随机密钥" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "3️⃣  管理员密码" -ForegroundColor Cyan
    Write-Host "   (管理后台登录密码)" -ForegroundColor Gray
    $admin_password = Read-Host "   请输入管理员密码 (默认: admin)"
    if (-not $admin_password) { $admin_password = "admin" }
    Write-Host ""
    
    Write-Host "4️⃣  是否允许用户注册？" -ForegroundColor Cyan
    $register_input = Read-Host "   是/否 (默认: 是)"
    if ($register_input -match "^[NnFfOo否false]$") {
        $register_enabled = "false"
    } else {
        $register_enabled = "true"
    }
    Write-Host ""
    
    # 生成 .env 文件
    Write-Host "✅ 正在生成 .env 文件..." -ForegroundColor Green
    $envContent = @"
# TokensByte 环境变量配置
# 生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# 数据库配置 (内置 PostgreSQL)
DATABASE_URL=postgres://tokensapi:${postgres_password}@postgres:5432/tokensapi
POSTGRES_USER=tokensapi
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=tokensapi

# JWT 密钥
JWT_SECRET=${jwt_secret}

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${admin_password}

# 端口配置
BACKEND_PORT=3000
FRONTEND_PORT=80

# 功能开关
REGISTER_ENABLED=${register_enabled}

# 日志级别
RUST_LOG=info
"@
    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    
    Write-Host "✅ .env 文件已创建！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 配置摘要:" -ForegroundColor Cyan
    Write-Host "   - 数据库密码: [已自动生成 16 位强密码]" -ForegroundColor Green
    Write-Host "   - JWT_SECRET: [已自动生成 64 位随机密钥]" -ForegroundColor Green
    Write-Host "   - 管理员密码: $admin_password"
    $regText = if ($register_enabled -eq "true") { "允许" } else { "禁止" }
    Write-Host "   - 用户注册: $regText"
    Write-Host ""
    
    # 确认配置
    $confirm = Read-Host "是否使用此配置继续部署？(y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "部署已取消" -ForegroundColor Yellow
        Write-Host "您可以编辑 .env 文件修改配置，然后重新运行此脚本" -ForegroundColor Gray
        pause
        exit 0
    }
    Write-Host ""
} else {
    Write-Host "✅ 发现已有的 .env 文件" -ForegroundColor Green
    Write-Host ""
    
    # 显示当前配置摘要
    Write-Host "📋 当前配置:" -ForegroundColor Cyan
    $envContent = Get-Content ".env" -Raw
    
    if ($envContent -match "POSTGRES_PASSWORD=(.*)") {
        Write-Host "   - 数据库密码: [已配置]"
    }
    if ($envContent -match "JWT_SECRET=(.*)") {
        Write-Host "   - JWT_SECRET: [已配置]"
    }
    if ($envContent -match "ADMIN_PASSWORD=(.*)") {
        Write-Host "   - 管理员密码: $($matches[1])"
    }
    if ($envContent -match "REGISTER_ENABLED=(.*)") {
        $reg = $matches[1]
        $regText = if ($reg -eq "true") { "允许" } else { "禁止" }
        Write-Host "   - 用户注册: $regText"
    }
    Write-Host ""
    
    # 询问是否重新配置
    $reconfig = Read-Host "是否重新配置？(y/n)"
    if ($reconfig -eq "y" -or $reconfig -eq "Y") {
        Write-Host ""
        Write-Host "📝 开始重新配置..." -ForegroundColor Cyan
        Remove-Item ".env" -Force
        Write-Host ""
        Write-Host "✅ 已删除旧配置，请重新运行此脚本" -ForegroundColor Green
        Write-Host "   命令: .\deploy.ps1" -ForegroundColor Gray
        pause
        exit 0
    }
    Write-Host ""
}

# 询问部署模式
Write-Host ""
Write-Host "请选择部署模式:" -ForegroundColor Cyan
Write-Host "  1) 开发环境 (热重载，适合日常开发)" -ForegroundColor White
Write-Host "  2) 生产环境 (内置 PostgreSQL，开箱即用)" -ForegroundColor White
Write-Host ""
$mode = Read-Host "请输入选项 (1/2)"

switch ($mode) {
    "1" {
        Write-Host ""
        Write-Host "🚀 启动开发环境 (热重载)..." -ForegroundColor Cyan
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
        
        Write-Host ""
        Write-Host "✅ 开发环境已启动！" -ForegroundColor Green
        Write-Host ""
        Write-Host "📍 访问地址:" -ForegroundColor Cyan
        Write-Host "   - 用户端: http://localhost:5173"
        Write-Host "   - 管理后台: http://localhost:5173/admin0755"
        Write-Host "   - API: http://localhost:3000/v1"
        Write-Host ""
        Write-Host " 查看日志: docker compose logs -f" -ForegroundColor Yellow
    }
    "2" {
        Write-Host ""
        Write-Host "🚀 启动生产环境..." -ForegroundColor Cyan
        docker compose up -d
        
        Write-Host ""
        Write-Host "✅ 生产环境部署完成！" -ForegroundColor Green
        Write-Host ""
        Write-Host "📍 访问地址:" -ForegroundColor Cyan
        Write-Host "   - 用户端: http://localhost:${FRONTEND_PORT:-80}"
        Write-Host "   - 管理后台: http://localhost:${FRONTEND_PORT:-80}/admin0755"
        Write-Host "   - API: http://localhost:${BACKEND_PORT:-3000}/v1"
        Write-Host ""
        Write-Host "👤 默认管理员账号:" -ForegroundColor Cyan
        Write-Host "   - 用户名: admin"
        Write-Host "   - 密码: admin (请通过管理后台修改)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "📊 服务状态:" -ForegroundColor Cyan
        docker compose ps
        Write-Host ""
        Write-Host "📝 查看日志: docker compose logs -f" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "💡 提示: 生产环境建议配置 HTTPS 反向代理" -ForegroundColor Yellow
        Write-Host "💡 如需使用外部数据库，修改 .env 中的 DATABASE_URL 并注释掉 docker-compose.yml 中的 postgres 服务" -ForegroundColor Yellow
    }
    default {
        Write-Host "❌ 无效选项" -ForegroundColor Red
        pause
        exit 1
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
pause

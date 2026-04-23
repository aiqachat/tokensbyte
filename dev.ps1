# 启动开发环境的便捷脚本
Write-Host "🚀 正在启动全实时热重载开发环境..." -ForegroundColor Green
$env:FRONTEND_PORT = "5173"
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

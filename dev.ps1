# TokensByte 开发环境启动脚本 (Windows PowerShell)
# ──────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  🛠  TokensByte 开发环境启动器" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""
Write-Host "  [1] 本地开发  (推荐，编译速度快)" -ForegroundColor Cyan
Write-Host "      Postgres 在 Docker 中运行"
Write-Host "      后端 cargo watch + 前端 Vite HMR 在本地运行"
Write-Host ""
Write-Host "  [2] Docker 开发  (全容器热重载)" -ForegroundColor Cyan
Write-Host "      所有服务在 Docker 中运行"
Write-Host "      源码挂载到容器，自动热更新"
Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""

$choice = Read-Host "请选择开发模式 [1/2] (默认 1)"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

switch ($choice) {
    "2" {
        # ── Docker 全容器开发模式 ──────────────────────────
        Write-Host ""
        Write-Host "🐳 正在启动 Docker 全容器开发环境 (热重载)..." -ForegroundColor Cyan
        Write-Host "   后端: cargo watch (容器内编译)"
        Write-Host "   前端: Vite HMR (容器内运行)"
        Write-Host "   数据库: Postgres 16"
        Write-Host ""
        Write-Host "   后端地址: http://localhost:3000"
        $frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5173" }
        Write-Host "   前端地址: http://localhost:$frontendPort"
        Write-Host ""
        Write-Host "   按 Ctrl+C 停止所有服务"
        Write-Host ""

        docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
    }

    "1" {
        # ── 本地开发模式 ──────────────────────────────────
        Write-Host ""
        Write-Host "🚀 正在启动本地开发环境 (数据库在 Docker 中运行)..." -ForegroundColor Cyan

        # 1. 启动 Docker 中的 Postgres（合并 dev.yml 以获取端口映射）
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

        Write-Host "⏳ 等待数据库就绪..." -ForegroundColor Yellow
        # 等待 Postgres 健康检查通过
        $maxAttempts = 30
        for ($i = 1; $i -le $maxAttempts; $i++) {
            $result = docker exec tokensbyte-postgres pg_isready -U tokensapi 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ 数据库已就绪" -ForegroundColor Green
                break
            }
            if ($i -eq $maxAttempts) {
                Write-Host "❌ 数据库启动超时，请检查 Docker" -ForegroundColor Red
                exit 1
            }
            Start-Sleep -Seconds 1
        }

        # 2. 检查并安装前端依赖
        if (-not (Test-Path "frontend/node_modules")) {
            Write-Host "📦 正在安装前端依赖..." -ForegroundColor Yellow
            Set-Location frontend
            npm install
            Set-Location ..
        }

        # 3. 导出环境变量，让本地 backend 连接到 localhost
        $env:DATABASE_URL = "postgres://tokensapi:tokensapi@localhost:5432/tokensapi"
        $env:RUST_LOG = "info"

        Write-Host ""
        Write-Host "✅ 准备就绪，同时拉起后端和前端服务..." -ForegroundColor Green
        Write-Host "   后端地址: http://localhost:3000"
        Write-Host "   前端地址: http://localhost:5173"
        Write-Host ""
        Write-Host "   按 Ctrl+C 停止所有服务" -ForegroundColor Yellow
        Write-Host ""

        # 使用 PowerShell Job 同时运行前后端
        $backendJob = Start-Job -ScriptBlock {
            Set-Location $using:PWD
            Set-Location backend
            $env:DATABASE_URL = $using:env:DATABASE_URL
            $env:RUST_LOG = $using:env:RUST_LOG
            cargo watch -c -w src -x run 2>&1
        }

        $frontendJob = Start-Job -ScriptBlock {
            Set-Location $using:PWD
            Set-Location frontend
            npm run dev 2>&1
        }

        try {
            # 持续输出两个 Job 的日志
            while ($true) {
                $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
                if ($backendOutput) {
                    $backendOutput | ForEach-Object { Write-Host "[Rust] $_" -ForegroundColor Cyan }
                }

                $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
                if ($frontendOutput) {
                    $frontendOutput | ForEach-Object { Write-Host "[Vite] $_" -ForegroundColor Blue }
                }

                # 检查 Job 是否结束
                if ($backendJob.State -eq "Completed" -and $frontendJob.State -eq "Completed") {
                    break
                }

                Start-Sleep -Milliseconds 200
            }
        }
        finally {
            Write-Host ""
            Write-Host "🛑 正在停止所有服务..." -ForegroundColor Yellow
            Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
            Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
            Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
            Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
        }
    }

    default {
        Write-Host "❌ 无效选项，请输入 1 或 2" -ForegroundColor Red
        exit 1
    }
}
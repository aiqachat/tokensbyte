# TokensByte 开发环境启动脚本 (Windows PowerShell 5.1 / 7+)
# ──────────────────────────────────────────────────
# 默认后台：端口就绪后脚本退出，进程继续跑；前台日志：.\dev.ps1 1 fg（Ctrl+C 停本实例）
# 多实例：共用 Postgres + 端口自动避让；中文路径：UTF-8 + CARGO_TARGET_DIR 重定向 + Start-Process
# 停止：前台模式下 Ctrl+C / Ctrl+Z 释放本实例端口；下次启动会回收本仓库残留
# 可选：PROJECT_NAME / BACKEND_PORT / FRONTEND_PORT / POSTGRES_PORT / DATABASE_URL / DEV_ATTACH

$ErrorActionPreference = "Stop"

try { chcp 65001 | Out-Null } catch {}
try {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
} catch {}

$RootDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Resolve-Path -LiteralPath ".").Path }
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
Set-Location -LiteralPath $RootDir

function Test-NonAsciiText([string]$Text) {
    return -not [string]::IsNullOrEmpty($Text) -and ($Text -match '[^\x00-\x7F]')
}

# 与 dev.sh 一致：按完整路径哈希，避免同名不同路径的 checkout 共用 state
function Get-PathStateId([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Path)) |
            ForEach-Object { $_.ToString('x2') }) -join ''
        return $hash.Substring(0, 12)
    } finally { $sha.Dispose() }
}

function Test-CmdBelongsToRepo([string]$Cmd, [string]$RootNorm) {
    if ([string]::IsNullOrEmpty($Cmd)) { return $false }
    $markers = @(
        ($RootNorm + '\frontend'),
        ($RootNorm + '\backend'),
        ($RootNorm + '\dev.ps1'),
        ($RootNorm + '/frontend'),
        ($RootNorm + '/backend'),
        ($RootNorm + '/dev.ps1')
    )
    foreach ($m in $markers) {
        if ($Cmd.IndexOf($m, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

function Test-PortInUse([int]$Port) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start(); $listener.Stop()
        return $false
    } catch { return $true }
}

function Get-FreePort([int]$Start, [string]$Label) {
    for ($p = $Start; $p -le ($Start + 100); $p++) {
        if (-not (Test-PortInUse $p)) {
            if ($p -ne $Start) {
                Write-Host "ℹ️  ${Label} 端口 ${Start} 已被占用，改用 ${p}" -ForegroundColor Cyan
            }
            return $p
        }
    }
    Write-Host "❌ 无法为 ${Label} 找到可用端口（已尝试 ${Start}-$($Start + 100)）" -ForegroundColor Red
    exit 1
}

function Test-DockerPg([string]$Container, [string]$User) {
    if ([string]::IsNullOrWhiteSpace($Container)) { return $false }
    docker exec $Container pg_isready -U $User 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Test-SharedPostgresReady([int]$Port, [string]$User, [string[]]$Names) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(800) -and $tcp.Connected) {
            $tcp.Close()
            return $true
        }
        try { $tcp.Close() } catch {}
    } catch {}

    foreach ($n in $Names) {
        if (Test-DockerPg $n $User) { return $true }
    }
    $cid = (docker ps --filter "publish=${Port}" --format "{{.ID}}" 2>$null | Select-Object -First 1)
    return (Test-DockerPg $cid $User)
}

function Write-NewLogLines([string]$Path, [ref]$Offset, [string]$Prefix, [ConsoleColor]$Color) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
        $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        try {
            if ($Offset.Value -gt $fs.Length) { $Offset.Value = 0 }
            $fs.Position = $Offset.Value
            $reader = New-Object System.IO.StreamReader($fs, [System.Text.UTF8Encoding]::new($false), $true)
            try {
                $chunk = $reader.ReadToEnd()
                $Offset.Value = $fs.Position
                if ([string]::IsNullOrEmpty($chunk)) { return }
                foreach ($line in ($chunk -split "`r?`n")) {
                    if ($line.Length -gt 0) { Write-Host "[$Prefix] $line" -ForegroundColor $Color }
                }
            } finally { $reader.Dispose() }
        } finally { $fs.Dispose() }
    } catch {}
}

function Stop-PidTree([int]$ProcessId) {
    if ($ProcessId -le 0) { return }
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Stop-ProcessTree([System.Diagnostics.Process]$Proc) {
    if ($null -eq $Proc -or $Proc.HasExited) { return }
    Stop-PidTree $Proc.Id
}

# 仅释放本仓库相关监听进程（多实例安全，不误杀其它 checkout）
function Stop-ListenPort([int]$Port, [string]$RootNorm) {
    if ($Port -le 0) { return }
    $procIds = @()
    try {
        $procIds = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {}
    if ($procIds.Count -eq 0) {
        foreach ($line in @(netstat -ano 2>$null | Select-String -Pattern ":${Port}\s+.*LISTENING")) {
            $parts = @($line.ToString() -split '\s+' | Where-Object { $_ -ne '' })
            if ($parts.Count -ge 5 -and $parts[-1] -match '^\d+$') { $procIds += [int]$parts[-1] }
        }
        $procIds = @($procIds | Select-Object -Unique)
    }
    foreach ($procId in $procIds) {
        $cmd = ''
        try {
            $cmd = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue).CommandLine
        } catch {}
        if (Test-CmdBelongsToRepo $cmd $RootNorm) { Stop-PidTree $procId }
    }
}

function Save-RunState([int]$BackendPort, [int]$FrontendPort, [int]$BackendPid, [int]$FrontendPid) {
    @(
        "BACKEND_PORT=$BackendPort"
        "FRONTEND_PORT=$FrontendPort"
        "BACKEND_PID=$BackendPid"
        "FRONTEND_PID=$FrontendPid"
    ) | Set-Content -LiteralPath $StateFile -Encoding utf8
}

$script:DevStopped = $false

function Stop-LocalServices(
    [System.Diagnostics.Process]$BackendProc,
    [System.Diagnostics.Process]$FrontendProc,
    [int]$BackendPort,
    [int]$FrontendPort
) {
    if ($script:DevStopped) { return }
    $script:DevStopped = $true
    Write-Host ""; Write-Host "🛑 正在停止本实例服务..." -ForegroundColor Yellow
    Stop-ProcessTree $BackendProc
    Stop-ProcessTree $FrontendProc
    $rootNorm = $RootDir.TrimEnd('\', '/')
    Stop-ListenPort $BackendPort $rootNorm
    Stop-ListenPort $FrontendPort $rootNorm
    Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
    Write-Host "✅ 本实例已停止，端口已释放" -ForegroundColor Green
}

# 检测停止键：Windows 上 Ctrl+C / Ctrl+Z / Ctrl+Break 均视为停止
function Test-DevStopKeyPressed {
    try {
        if (-not [Console]::KeyAvailable) { return $false }
        $key = [Console]::ReadKey($true)
        $ctrl = ($key.Modifiers -band [ConsoleModifiers]::Control) -ne 0
        if (-not $ctrl) { return $false }
        return ($key.Key -eq [ConsoleKey]::C -or $key.Key -eq [ConsoleKey]::Z)
    } catch {
        return $false
    }
}

# 回收本仓库残留前后端（不影响其它目录 / Postgres）
function Clear-RepoDevLeftovers {
    Write-Host "🧹 清理本仓库残留的前后端占用..." -ForegroundColor Yellow
    if (Test-Path -LiteralPath $StateFile) {
        $map = @{}
        Get-Content -LiteralPath $StateFile -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match '^(BACKEND_PORT|FRONTEND_PORT|BACKEND_PID|FRONTEND_PID)=(\d+)$') {
                $map[$matches[1]] = [int]$matches[2]
            }
        }
        foreach ($key in @('BACKEND_PID', 'FRONTEND_PID')) {
            if ($map.ContainsKey($key)) { Stop-PidTree $map[$key] }
        }
        $rootNorm = $RootDir.TrimEnd('\', '/')
        if ($map.ContainsKey('BACKEND_PORT')) { Stop-ListenPort $map['BACKEND_PORT'] $rootNorm }
        if ($map.ContainsKey('FRONTEND_PORT')) { Stop-ListenPort $map['FRONTEND_PORT'] $rootNorm }
        Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
    }

    $rootNorm = $RootDir.TrimEnd('\', '/')
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
        $cmd = [string]$_.CommandLine
        if (-not (Test-CmdBelongsToRepo $cmd $rootNorm)) { return }
        if ($cmd -notmatch 'vite|tokensbyte-server|cargo-watch|npm run dev|dev\.ps1') { return }
        Stop-PidTree ([int]$_.ProcessId)
    }
}

$FolderName = Split-Path -Leaf $RootDir
$ProjectName = if ($env:PROJECT_NAME) { $env:PROJECT_NAME } else { $FolderName }
$AsciiProjectId = Get-PathStateId $RootDir
$StateFile = Join-Path $env:TEMP "tokensbyte-dev-$AsciiProjectId.state"
$PathHasNonAscii = (Test-NonAsciiText $RootDir) -or (Test-NonAsciiText $ProjectName)
$PgNames = @(
    "tokensbyte-ws-postgres",
    "$ProjectName-postgres",
    "$AsciiProjectId-postgres",
    "tokensbyte-postgres"
)

$PostgresPort = if ($env:POSTGRES_PORT) { [int]$env:POSTGRES_PORT } else { 5432 }
$PostgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "tokensapi" }
$PreferredBackendPort = if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 3000 }
$PreferredFrontendPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 5173 }

# 解析：.\dev.ps1 [1|2] [bg|fg]；DEV_ATTACH=1 等同 fg（默认后台 bg）
$DevAttach = ($env:DEV_ATTACH -eq "1")
$choice = $null
foreach ($a in @($args)) {
    $t = [string]$a
    if ([string]::IsNullOrWhiteSpace($t)) { continue }
    switch -Regex ($t.ToLowerInvariant()) {
        '^[12]$' { $choice = $t }
        '^(fg|foreground|attach|log)$' { $DevAttach = $true }
        '^(bg|background|daemon)$' { $DevAttach = $false }
        '^(-h|--help|help)$' {
            Write-Host "用法: .\dev.ps1 [1|2] [bg|fg]"
            Write-Host "  1 / 默认  本地开发（默认 bg 后台）"
            Write-Host "  2         Docker 全容器"
            Write-Host "  fg        前台输出日志，Ctrl+C 停止本实例"
            Write-Host "  bg        后台运行（默认）"
            exit 0
        }
        default {
            Write-Host "❌ 无效参数: $t（可用: .\dev.ps1 [1|2] [bg|fg]）" -ForegroundColor Red
            exit 1
        }
    }
}
if ([string]::IsNullOrWhiteSpace($choice)) {
    if (![string]::IsNullOrWhiteSpace($env:DEV_MODE)) {
        $choice = $env:DEV_MODE
    } else {
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════" -ForegroundColor White
        Write-Host "  🛠  $ProjectName 开发环境启动器" -ForegroundColor White
        Write-Host "═══════════════════════════════════════════════════" -ForegroundColor White
        Write-Host ""
        Write-Host "  [1] 本地开发  (默认后台；前台日志: .\dev.ps1 1 fg)" -ForegroundColor Cyan
        Write-Host "      共用 Docker Postgres；前后端端口自动避让；兼容中文路径" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  [2] Docker 开发  (全容器热重载)" -ForegroundColor Cyan
        Write-Host "      所有服务在 Docker 中运行，源码挂载热更新" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════" -ForegroundColor White
        Write-Host ""
        if ($PathHasNonAscii) {
            Write-Host "ℹ️  非 ASCII 路径兼容模式 · $AsciiProjectId" -ForegroundColor Cyan
            Write-Host "   $RootDir" -ForegroundColor DarkGray
            Write-Host ""
        }
        $choice = Read-Host "请选择开发模式 [1/2] (默认 1)"
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
    }
}

if ($PathHasNonAscii -and $choice -eq "2") {
    Write-Host "ℹ️  非 ASCII 路径兼容模式 · $AsciiProjectId" -ForegroundColor Cyan
    Write-Host "   $RootDir" -ForegroundColor DarkGray
    Write-Host ""
}

switch ($choice) {
    "2" {
        Write-Host ""
        Write-Host "🐳 正在启动 Docker 全容器开发环境 (热重载)..." -ForegroundColor Cyan
        $env:PROJECT_NAME = $AsciiProjectId
        $env:COMPOSE_PROJECT_NAME = $AsciiProjectId
        $env:BACKEND_PORT = "$(Get-FreePort $PreferredBackendPort '后端')"
        $env:FRONTEND_PORT = "$(Get-FreePort $PreferredFrontendPort '前端')"
        $env:POSTGRES_PORT = "$(Get-FreePort $PostgresPort '数据库')"
        if ($PathHasNonAscii) {
            Write-Host "⚠️  目录含非 ASCII 时 Docker 挂载可能不稳定；异常请用模式 [1] 或改英文路径。" -ForegroundColor Yellow
        }
        Write-Host "   后端: http://localhost:$($env:BACKEND_PORT)"
        Write-Host "   前端: http://localhost:$($env:FRONTEND_PORT)"
        Write-Host "   数据库: localhost:$($env:POSTGRES_PORT)"
        Write-Host ""; Write-Host "   按 Ctrl+C 停止所有服务"; Write-Host ""
        docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
    }

    "1" {
        Write-Host ""
        if ($DevAttach) {
            Write-Host "🚀 正在前台启动本地开发环境（日志输出到本终端）..." -ForegroundColor Cyan
        } else {
            Write-Host "🚀 正在后台启动本地开发环境..." -ForegroundColor Cyan
        }
        $env:PROJECT_NAME = $ProjectName

        Clear-RepoDevLeftovers

        if (Test-SharedPostgresReady $PostgresPort $PostgresUser $PgNames) {
            Write-Host "✅ 复用本机 Postgres (port ${PostgresPort})" -ForegroundColor Green
        } else {
            Write-Host "🐘 启动 Docker Postgres..." -ForegroundColor Yellow
            $env:PROJECT_NAME = $AsciiProjectId
            $env:COMPOSE_PROJECT_NAME = $AsciiProjectId
            docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
            Write-Host "⏳ 等待数据库就绪..." -ForegroundColor Yellow
            $ready = $false
            for ($i = 1; $i -le 30; $i++) {
                if (Test-DockerPg "${AsciiProjectId}-postgres" $PostgresUser) {
                    Write-Host "✅ 数据库已就绪" -ForegroundColor Green
                    $ready = $true
                    break
                }
                Start-Sleep -Seconds 1
            }
            if (-not $ready) {
                Write-Host "❌ 数据库启动超时，请检查 Docker" -ForegroundColor Red
                exit 1
            }
            $env:PROJECT_NAME = $ProjectName
        }

        if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
            Write-Host "📦 正在安装前端依赖..." -ForegroundColor Yellow
            Push-Location -LiteralPath $FrontendDir
            try {
                npm install
                if ($LASTEXITCODE -ne 0) { throw "npm install 失败 (exit=$LASTEXITCODE)" }
            } finally { Pop-Location }
        }

        $BackendPort = Get-FreePort $PreferredBackendPort "后端"
        $FrontendPort = Get-FreePort $PreferredFrontendPort "前端"
        $env:BACKEND_PORT = "$BackendPort"
        $env:FRONTEND_PORT = "$FrontendPort"
        $env:PORT = "$BackendPort"
        $env:HOST = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
        $env:POSTGRES_PORT = "$PostgresPort"
        if (-not $env:DATABASE_URL) {
            $env:DATABASE_URL = "postgres://tokensapi:tokensapi@localhost:${PostgresPort}/tokensapi"
        }
        $env:RUST_LOG = if ($env:RUST_LOG) { $env:RUST_LOG } else { "info" }
        $env:BASE_URL = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:${BackendPort}" }
        $env:VITE_API_TARGET = "http://127.0.0.1:${BackendPort}"

        if ($PathHasNonAscii -or (Test-NonAsciiText $env:CARGO_TARGET_DIR)) {
            $targetDir = Join-Path $env:LOCALAPPDATA "tokensbyte-dev\target\$AsciiProjectId"
            New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
            $env:CARGO_TARGET_DIR = $targetDir
            Write-Host "ℹ️  CARGO_TARGET_DIR -> $targetDir" -ForegroundColor Cyan
        }

        if (-not $env:CARGO_INCREMENTAL) { $env:CARGO_INCREMENTAL = "1" }

        $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
        $hasVS = $false
        if (Test-Path -LiteralPath $vsWhere) {
            $vsInfo = & $vsWhere -prerelease -all -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
            if (![string]::IsNullOrEmpty($vsInfo)) { $hasVS = $true }
        }
        if (-not $hasVS -and (Get-Command link.exe -ErrorAction SilentlyContinue)) { $hasVS = $true }

        $rustToolchain = ""
        $defaultToolchain = (rustup show active-toolchain 2>$null)
        if (-not $hasVS -and ($defaultToolchain -like "*msvc*")) {
            $gnu = (rustup toolchain list 2>$null | Where-Object { $_ -like "*gnu*" } | Select-Object -First 1)
            if ($gnu) {
                $rustToolchain = "+" + (($gnu -split '\s+')[0])
                Write-Host "ℹ️  未检测到 MSVC，切换 GNU: $rustToolchain" -ForegroundColor Cyan
                if ($PathHasNonAscii) {
                    Write-Host "⚠️  中文路径 + GNU 可能链接失败，建议安装 VS Build Tools 或改英文路径。" -ForegroundColor Yellow
                }
            } else {
                Write-Warning "⚠️ 未检测到 MSVC/GNU 工具链，本地编译可能失败。"
            }
        }

        $cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
        $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
        $cargoExe = if ($cargoCmd) { $cargoCmd.Source } else { $null }
        $npmExe = if ($npmCmd) { $npmCmd.Source } else { $null }
        if (-not $cargoExe) { Write-Host "❌ 未找到 cargo，请先安装 Rust" -ForegroundColor Red; exit 1 }
        if (-not $npmExe) { Write-Host "❌ 未找到 npm，请先安装 Node.js" -ForegroundColor Red; exit 1 }

        $logDir = Join-Path $env:TEMP "tokensbyte-dev-$AsciiProjectId"
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        $backendOut = Join-Path $logDir "backend.out.log"
        $backendErr = Join-Path $logDir "backend.err.log"
        $frontendOut = Join-Path $logDir "frontend.out.log"
        $frontendErr = Join-Path $logDir "frontend.err.log"
        foreach ($f in @($backendOut, $backendErr, $frontendOut, $frontendErr)) {
            Set-Content -LiteralPath $f -Value "" -Encoding utf8
        }

        $cargoArgs = @("watch", "-w", "src", "-w", "Cargo.toml", "-w", "Cargo.lock", "-w", "build.rs", "-x", "run")
        if ($rustToolchain) { $cargoArgs = @($rustToolchain) + $cargoArgs }

        Write-Host ""
        Write-Host "   项目: $ProjectName"
        Write-Host "   数据库: localhost:${PostgresPort} (共享)"
        Write-Host "   后端: http://localhost:${BackendPort}"
        Write-Host "   前端: http://localhost:${FrontendPort}"
        Write-Host "   API 代理: $($env:VITE_API_TARGET)"
        if ($DevAttach) {
            Write-Host ""; Write-Host "📺 前台日志模式：Ctrl+C / Ctrl+Z 停止本实例" -ForegroundColor Yellow; Write-Host ""
        } else {
            Write-Host ""; Write-Host "   后台模式：就绪后本窗口退出，服务继续运行" -ForegroundColor DarkGray
            Write-Host "   前台看日志: .\dev.ps1 1 fg" -ForegroundColor DarkGray; Write-Host ""
        }

        Write-Host "⚙️ 启动 Rust 服务 (watch, :${BackendPort})..." -ForegroundColor Cyan
        $backendProc = Start-Process -FilePath $cargoExe -ArgumentList $cargoArgs `
            -WorkingDirectory $BackendDir -PassThru -NoNewWindow `
            -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
        Write-Host "⚙️ 启动 Vite 服务 (:${FrontendPort})..." -ForegroundColor Cyan
        $frontendProc = Start-Process -FilePath $npmExe `
            -ArgumentList @("run", "dev", "--", "--port", "$FrontendPort", "--strictPort", "--host", "0.0.0.0") `
            -WorkingDirectory $FrontendDir -PassThru -NoNewWindow `
            -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
        Save-RunState $BackendPort $FrontendPort $backendProc.Id $frontendProc.Id

        $backendOff = [ref]0; $backendErrOff = [ref]0
        $frontendOff = [ref]0; $frontendErrOff = [ref]0
        $WaitMax = if ($env:DEV_WAIT_MAX -match '^\d+$') { [int]$env:DEV_WAIT_MAX } else { 600 }

        if (-not $DevAttach) {
            # 后台：等端口就绪后退出，不杀进程（与 macOS ./dev.sh 一致）
            Write-Host "⏳ 等待后端 (${BackendPort}) 和前端 (${FrontendPort}) 就绪（最长 ${WaitMax}s）..." -ForegroundColor Yellow
            $backendUp = $false; $frontendUp = $false
            for ($i = 1; $i -le $WaitMax; $i++) {
                if (-not $backendUp -and (Test-PortInUse $BackendPort)) {
                    $backendUp = $true
                    Write-Host "✅ 后端已监听 :${BackendPort}" -ForegroundColor Green
                }
                if (-not $frontendUp -and (Test-PortInUse $FrontendPort)) {
                    $frontendUp = $true
                    Write-Host "✅ 前端已监听 :${FrontendPort}" -ForegroundColor Green
                }
                if ($backendUp -and $frontendUp) {
                    Write-Host "🎉 本地开发环境已在后台顺利拉起！" -ForegroundColor Green
                    Write-Host "   👉 前端面板: http://localhost:${FrontendPort}"
                    Write-Host "   👉 后端 API: http://localhost:${BackendPort}"
                    Write-Host "   (日志目录: $logDir)"
                    exit 0
                }
                if (($i % 15) -eq 0) {
                    $tip = @()
                    if (-not $backendUp) { $tip += "后端编译/启动中" }
                    if (-not $frontendUp) { $tip += "前端未就绪" }
                    Write-Host ("… {0}s / {1}s  {2}" -f $i, $WaitMax, ($tip -join '；')) -ForegroundColor DarkGray
                }
                Start-Sleep -Seconds 1
            }
            Write-Host "❌ 启动超时，请检查日志目录: $logDir" -ForegroundColor Red
            exit 1
        }

        $script:DevStopRequested = $false
        $script:DevStopped = $false
        $prevTreatCtrlC = $false
        try { $prevTreatCtrlC = [Console]::TreatControlCAsInput } catch {}
        try { [Console]::TreatControlCAsInput = $true } catch {}
        $cancelHandler = {
            param($sender, $e)
            $e.Cancel = $true
            $script:DevStopRequested = $true
        }
        try { [Console]::add_CancelKeyPress($cancelHandler) } catch {}
        try {
            Write-Host "📺 持续输出日志中..." -ForegroundColor Cyan
            while (-not $script:DevStopRequested) {
                if (Test-DevStopKeyPressed) { break }
                Write-NewLogLines $backendOut $backendOff "Rust" Cyan
                Write-NewLogLines $backendErr $backendErrOff "Rust" Cyan
                Write-NewLogLines $frontendOut $frontendOff "Vite" Blue
                Write-NewLogLines $frontendErr $frontendErrOff "Vite" Blue
                $alive = ($backendProc -and -not $backendProc.HasExited) -or ($frontendProc -and -not $frontendProc.HasExited)
                if (-not $alive) { break }
                Start-Sleep -Milliseconds 250
            }
        } finally {
            try { [Console]::remove_CancelKeyPress($cancelHandler) } catch {}
            try { [Console]::TreatControlCAsInput = $prevTreatCtrlC } catch {}
            Stop-LocalServices $backendProc $frontendProc $BackendPort $FrontendPort
        }
    }

    default {
        Write-Host "❌ 无效选项，请使用: .\dev.ps1 [1|2] [bg|fg]" -ForegroundColor Red
        exit 1
    }
}

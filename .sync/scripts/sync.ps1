# TokensByte 仓库同步脚本 (Windows PowerShell)
# 支持内部 → 商用 → 公开的分层同步
# 版本号: 2.0.0

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ConfigDir = Join-Path $ProjectRoot ".sync\config"

# 在 URL 中注入 Token
function Inject-Token {
    param([string]$Url)
    if ($env:GITHUB_TOKEN) {
        return $Url -replace "https://", "https://x-access-token:$($env:GITHUB_TOKEN)@"
    }
    return $Url
}

# 加载配置
function Load-Config {
    $filterFile = Join-Path $ConfigDir "filters.json"
    $reposFile = Join-Path $ConfigDir "repos.json"
    
    if (-not (Test-Path $filterFile) -or -not (Test-Path $reposFile)) {
        Write-Host "❌ 配置文件不存在，请先创建配置文件" -ForegroundColor Red
        exit 1
    }
}

# 检查依赖项 (Copy-Sync 方案无外部依赖)
function Check-Dependencies {
    # 仅作预留
}

# 创建临时工作目录
function New-TempDir {
    $tempDir = Join-Path $env:TEMP "tokensbyte-sync-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    return $tempDir
}

# 同步到目标仓库的通用函数
function Sync-To-Target {
    param(
        [string]$TargetName,
        [object]$RepoConfig,
        [object]$FilterConfig
    )
    
    Write-Host "🚀 开始同步（方案1 - 覆盖复制）：内部仓库 → $TargetName" -ForegroundColor Cyan
    
    $tempDir = New-TempDir
    $downstreamDir = Join-Path $tempDir "downstream"
    
    # 1. 克隆下游仓库
    $targetUrl = Inject-Token -Url $RepoConfig.url
    $targetBranch = $RepoConfig.branch
    Write-Host "📁 克隆目标仓库: $targetUrl 到 $downstreamDir" -ForegroundColor Gray
    
    try {
        git clone --depth 1 -b $targetBranch $targetUrl $downstreamDir
    } catch {
        Write-Host "⚠️ 克隆失败或分支不存在，尝试初始化新仓库..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $downstreamDir -Force | Out-Null
        Set-Location $downstreamDir
        git init
        git checkout -b $targetBranch
        git remote add origin $targetUrl
        Set-Location $ProjectRoot
    }
    
    # 2. 清空下游工作区（保留 .git）
    if (Test-Path $downstreamDir) {
        Set-Location $downstreamDir
        Get-ChildItem -Path $downstreamDir -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
        Set-Location $ProjectRoot
    }
    
    # 3. 复制白名单包含的文件/文件夹
    if ($FilterConfig.include -and $FilterConfig.include.Count -gt 0) {
        foreach ($inc in $FilterConfig.include) {
            $incClean = $inc.TrimEnd('\').TrimEnd('/')
            $srcPath = Join-Path $ProjectRoot $incClean
            $destPath = Join-Path $downstreamDir $incClean
            
            if (Test-Path $srcPath) {
                $destParent = Split-Path -Parent $destPath
                if (-not (Test-Path $destParent)) {
                    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
                }
                
                if (Test-Path -Path $srcPath -PathType Container) {
                    if (-not (Test-Path $destPath)) {
                        New-Item -ItemType Directory -Path $destPath -Force | Out-Null
                    }
                    Copy-Item -Path "$srcPath\*" -Destination $destPath -Recurse -Force
                } else {
                    Copy-Item -Path $srcPath -Destination $destPath -Force
                }
            }
        }
    }
    
    # 4. 删除排除的文件/文件夹
    if ($FilterConfig.exclude -and $FilterConfig.exclude.Count -gt 0) {
        foreach ($exclude in $FilterConfig.exclude) {
            $excClean = $exclude.TrimEnd('\').TrimEnd('/')
            $destPath = Join-Path $downstreamDir $excClean
            if (Test-Path $destPath) {
                Remove-Item -Path $destPath -Recurse -Force
            }
        }
    }
    
    # 5. 提交并推送
    Set-Location $downstreamDir
    
    $status = git status --porcelain
    if ($status) {
        git config user.name "github-actions[bot]"
        git config user.email "github-actions[bot]@users.noreply.github.com"
        
        Set-Location $ProjectRoot
        $lastCommitSha = (git rev-parse --short HEAD).Trim()
        $lastCommitMsg = (git log -1 --pretty=%s).Trim()
        Set-Location $downstreamDir
        
        git add -A
        git commit -m "sync: update from internal at $lastCommitSha ($lastCommitMsg)"
        
        Write-Host "📤 推送更改到 $TargetName ($targetBranch)..." -ForegroundColor Gray
        git push origin $targetBranch
        Write-Host "✅ $TargetName 同步完成" -ForegroundColor Green
    } else {
        Write-Host "✨ $TargetName 没有发现变化，无需推送。" -ForegroundColor Green
    }
    
    Set-Location $ProjectRoot
    Remove-Item -Path $tempDir -Recurse -Force
}

# 同步：内部 → 商业
function Sync-InternalToCommercial {
    $reposConfig = Get-Content (Join-Path $ConfigDir "repos.json") | ConvertFrom-Json
    $filtersConfig = Get-Content (Join-Path $ConfigDir "filters.json") | ConvertFrom-Json
    Sync-To-Target -TargetName "商业仓库" -RepoConfig $reposConfig.commercial -FilterConfig $filtersConfig.internal_to_commercial
}

# 同步：内部 → 公开
function Sync-InternalToPublic {
    $reposConfig = Get-Content (Join-Path $ConfigDir "repos.json") | ConvertFrom-Json
    $filtersConfig = Get-Content (Join-Path $ConfigDir "filters.json") | ConvertFrom-Json
    Sync-To-Target -TargetName "公开仓库" -RepoConfig $reposConfig.public -FilterConfig $filtersConfig.internal_to_public
}

# 全量同步
function Sync-All {
    Sync-InternalToCommercial
    Sync-InternalToPublic
    Write-Host "🎉 全部同步完成！" -ForegroundColor Green
}

# 显示帮助
function Show-Help {
    Write-Host "TokensByte 仓库同步工具" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法: .\sync.ps1 [命令]"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  internal-to-commercial  同步内部仓库到商业仓库"
    Write-Host "  internal-to-public      同步内部仓库到公开仓库"
    Write-Host "  all                     同步全部（内部→商业 + 内部→公开）"
    Write-Host "  help                    显示此帮助信息"
    Write-Host ""
    Write-Host "环境变量:"
    Write-Host "  GITHUB_TOKEN            GitHub 访问令牌（可选，用于 CI/CD）"
}

# 主函数
function Main {
    Load-Config
    Check-Dependencies
    
    $command = if ($args.Count -gt 0) { $args[0] } else { "help" }
    
    switch ($command) {
        "internal-to-commercial" { Sync-InternalToCommercial }
        "internal-to-public" { Sync-InternalToPublic }
        "all" { Sync-All }
        "help" { Show-Help }
        "--help" { Show-Help }
        "-h" { Show-Help }
        default {
            Write-Host "❌ 未知命令: $command" -ForegroundColor Red
            Show-Help
            exit 1
        }
    }
}

Main @args

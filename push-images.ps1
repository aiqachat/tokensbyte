# TokensByte Docker Image Push Script
# Push local images to remote registry

$ErrorActionPreference = "Stop"

$ProjectName = if ($env:PROJECT_NAME) { $env:PROJECT_NAME } else { (Get-Item .).Name }

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ("  " + $ProjectName.ToUpper() + " Docker Image Push") -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

try {
    $dockerVersion = docker --version
    Write-Host ("[OK] Docker version: " + $dockerVersion) -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker not found. Please ensure Docker is running." -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

$RegistryBackend = "docker.cnb.cool/netbcloud/tokensbyte-ws/tokensbyte-ws-backend"
$RegistryFrontend = "docker.cnb.cool/netbcloud/tokensbyte-ws/tokensbyte-ws-frontend"

$tag = Read-Host "Enter tag to push (default: latest)"
if ([string]::IsNullOrWhiteSpace($tag)) { $tag = "latest" }

Write-Host ""
Write-Host "Build latest images first?" -ForegroundColor Cyan
Write-Host "   [1] Yes, build then push (Recommended)" -ForegroundColor Yellow
Write-Host "   [2] No, push existing local images" -ForegroundColor Yellow
$buildChoice = Read-Host "Enter [1/2] (default 1)"
if ([string]::IsNullOrWhiteSpace($buildChoice)) { $buildChoice = "1" }

if ($buildChoice -eq "1") {
    Write-Host ""
    Write-Host "[BUILD] Building Docker images..." -ForegroundColor Cyan
    $env:PROJECT_NAME = $ProjectName
    docker compose build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Image build failed! Push aborted." -ForegroundColor Red
        pause
        exit 1
    }
    Write-Host "[OK] Image build completed!" -ForegroundColor Green
    Write-Host ""
}

$BackendLocalImage = $ProjectName + "-backend:latest"
$FrontendLocalImage = $ProjectName + "-frontend:latest"

$backendExists = docker images -q $BackendLocalImage
$frontendExists = docker images -q $FrontendLocalImage

if (-not $backendExists -or -not $frontendExists) {
    Write-Host "[ERROR] Local images not found!" -ForegroundColor Red
    $beLabel = if ($backendExists) { "[OK]" } else { "[MISSING]" }
    $feLabel = if ($frontendExists) { "[OK]" } else { "[MISSING]" }
    Write-Host ("  Backend: " + $BackendLocalImage + " " + $beLabel)
    Write-Host ("  Frontend: " + $FrontendLocalImage + " " + $feLabel)
    Write-Host "[TIP] Please build images first or re-run with option 1." -ForegroundColor Yellow
    pause
    exit 1
}

$RemoteBackendImage = $RegistryBackend + ":" + $tag
$RemoteFrontendImage = $RegistryFrontend + ":" + $tag

Write-Host ""
Write-Host "[TAG] Tagging local images..." -ForegroundColor Cyan
Write-Host ("   -> Backend: " + $BackendLocalImage + " => " + $RemoteBackendImage) -ForegroundColor Gray
docker tag $BackendLocalImage $RemoteBackendImage

Write-Host ("   -> Frontend: " + $FrontendLocalImage + " => " + $RemoteFrontendImage) -ForegroundColor Gray
docker tag $FrontendLocalImage $RemoteFrontendImage

Write-Host ""
Write-Host "[PUSH] Pushing images to remote registry..." -ForegroundColor Cyan
Write-Host "   Make sure you have logged in via: docker login docker.cnb.cool" -ForegroundColor Yellow
Write-Host ""

Write-Host ("[PUSH] Backend: " + $RemoteBackendImage) -ForegroundColor Yellow
docker push $RemoteBackendImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Backend push failed! Check network or login status." -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host ("[PUSH] Frontend: " + $RemoteFrontendImage) -ForegroundColor Yellow
docker push $RemoteFrontendImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend push failed! Check network or login status." -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Push Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ("  Backend: " + $RemoteBackendImage) -ForegroundColor Gray
Write-Host ("  Frontend: " + $RemoteFrontendImage) -ForegroundColor Gray
Write-Host ""

pause

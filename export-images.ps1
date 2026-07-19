# TokensByte Docker Image Export Script
# Build and export images locally for uploading to cloud server

$ErrorActionPreference = "Stop"

$OutputDir = ".\docker-images"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ProjectName = if ($env:PROJECT_NAME) { $env:PROJECT_NAME } else { (Get-Item .).Name }

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ("  " + $ProjectName.ToUpper() + " Docker Image Export") -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

try {
    $dockerVersion = docker --version
    Write-Host ("[OK] Docker version: " + $dockerVersion) -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker not found. Please install Docker Desktop first." -ForegroundColor Red
    Write-Host "  Download: https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host ""

if (-Not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host "[BUILD] Building Docker images..." -ForegroundColor Cyan
Write-Host ""

$env:PROJECT_NAME = $ProjectName
docker compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Image build failed!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "[OK] Image build completed!" -ForegroundColor Green
Write-Host ""

Write-Host "[INFO] Image list:" -ForegroundColor Cyan
docker images ($ProjectName + "-*:latest")

$BackendImage = $ProjectName + "-backend:latest"
$FrontendImage = $ProjectName + "-frontend:latest"

$backendExists = docker images -q $BackendImage
$frontendExists = docker images -q $FrontendImage
if (-not $backendExists -or -not $frontendExists) {
    Write-Host "[ERROR] Images not found, build may have failed!" -ForegroundColor Red
    $beLabel = if ($backendExists) { "[OK] exists" } else { "[MISSING]" }
    $feLabel = if ($frontendExists) { "[OK] exists" } else { "[MISSING]" }
    Write-Host ("  Backend image: " + $beLabel)
    Write-Host ("  Frontend image: " + $feLabel)
    pause
    exit 1
}

Write-Host ""

Write-Host "[EXPORT] Exporting images..." -ForegroundColor Cyan
Write-Host ""

$BackendFile = $OutputDir + "\" + $ProjectName + "-backend-" + $Timestamp + ".tar"
Write-Host ("  -> Export backend: " + $BackendFile) -ForegroundColor Yellow
docker save -o $BackendFile $BackendImage
$BackendSize = (Get-Item $BackendFile).Length
Write-Host ("     Size: " + [math]::Round($BackendSize / 1MB, 2).ToString() + " MB") -ForegroundColor Gray

$FrontendFile = $OutputDir + "\" + $ProjectName + "-frontend-" + $Timestamp + ".tar"
Write-Host ("  -> Export frontend: " + $FrontendFile) -ForegroundColor Yellow
docker save -o $FrontendFile $FrontendImage
$FrontendSize = (Get-Item $FrontendFile).Length
Write-Host ("     Size: " + [math]::Round($FrontendSize / 1MB, 2).ToString() + " MB") -ForegroundColor Gray

Write-Host ""
Write-Host "[INFO] PostgreSQL image will be pulled from Docker Hub on deploy" -ForegroundColor Yellow
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Export Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[FILES] Exported files:" -ForegroundColor Cyan
$tarPattern = $OutputDir + "\*" + $Timestamp + ".tar"
Get-ChildItem $tarPattern | Format-Table Name, @{Label = "Size(MB)"; Expression = { [math]::Round($_.Length / 1MB, 2) } } -AutoSize

$TotalSize = (Get-ChildItem $tarPattern | Measure-Object -Property Length -Sum).Sum
Write-Host ("Total size: " + [math]::Round($TotalSize / 1MB, 2).ToString() + " MB") -ForegroundColor Cyan
Write-Host ""

# Generate import script (Linux/Mac)
$bashLines = @()
$bashLines += "#!/bin/bash"
$bashLines += "# " + $ProjectName.ToUpper() + " Docker Image Import Script (Linux/Mac)"
$bashLines += "set -e"
$bashLines += "PROJECT_NAME=`${PROJECT_NAME:-`$(basename `"`$PWD`")}"
$bashLines += 'echo "========================================="'
$bashLines += 'echo "  ${PROJECT_NAME^^} Docker Image Import"'
$bashLines += 'echo "========================================="'
$bashLines += 'echo ""'
$bashLines += "if ! command -v docker &> /dev/null; then"
$bashLines += '    echo "[ERROR] Docker not found. Install Docker first."'
$bashLines += "    exit 1"
$bashLines += "fi"
$bashLines += 'echo "[OK] Docker version: $(docker --version)"'
$bashLines += 'echo ""'
$bashLines += 'tar_files=$(ls *.tar 2>/dev/null || true)'
$bashLines += 'if [ -z "$tar_files" ]; then'
$bashLines += '    echo "[ERROR] No .tar files found in current directory"'
$bashLines += '    echo "  Please upload the exported image files here first."'
$bashLines += "    exit 1"
$bashLines += "fi"
$bashLines += 'echo "[IMPORT] Importing images..."'
$bashLines += 'echo ""'
$bashLines += "for tar_file in *.tar; do"
$bashLines += '    if [ -f "$tar_file" ]; then'
$bashLines += '        echo "  -> Import: $tar_file"'
$bashLines += '        docker load -i "$tar_file"'
$bashLines += '        echo ""'
$bashLines += "    fi"
$bashLines += "done"
$bashLines += 'echo "[OK] All images imported!"'
$bashLines += 'echo ""'
$bashLines += 'echo "[INFO] PostgreSQL will be pulled from Docker Hub on deploy"'
$bashLines += 'echo ""'
$bashLines += 'echo "========================================="'
$bashLines += 'echo "  Next Steps"'
$bashLines += 'echo "========================================="'
$bashLines += 'echo ""'
$bashLines += 'echo "1. Upload docker-compose.yml to server"'
$bashLines += 'echo "2. Create .env config file (cp .env.example .env)"'
$bashLines += 'echo "3. Start: docker compose up -d"'
$bashLines += 'echo ""'

$bashPath = $OutputDir + "\import-images.sh"
$bashLines -join "`n" | Out-File -FilePath $bashPath -Encoding ASCII
Write-Host ("[OK] Generated Linux/Mac import script: " + $bashPath) -ForegroundColor Green

# Generate import script (Windows)
$psLines = @()
$psLines += "# " + $ProjectName.ToUpper() + " Docker Image Import Script (Windows)"
$psLines += '$$ErrorActionPreference = "Stop"'
$psLines += '$$ProjectName = if ($$env:PROJECT_NAME) { $$env:PROJECT_NAME } else { (Get-Item .).Name }'
$psLines += 'Write-Host "=========================================" -ForegroundColor Cyan'
$psLines += 'Write-Host ("  " + $$ProjectName.ToUpper() + " Docker Image Import") -ForegroundColor Cyan'
$psLines += 'Write-Host "=========================================" -ForegroundColor Cyan'
$psLines += 'Write-Host ""'
$psLines += "try {"
$psLines += '    $$dockerVersion = docker --version'
$psLines += '    Write-Host ("[OK] Docker version: " + $$dockerVersion) -ForegroundColor Green'
$psLines += "} catch {"
$psLines += '    Write-Host "[ERROR] Docker not found" -ForegroundColor Red'
$psLines += "    exit 1"
$psLines += "}"
$psLines += 'Write-Host ""'
$psLines += '$$TarFiles = Get-ChildItem -Filter "*.tar" -ErrorAction SilentlyContinue'
$psLines += "if (-not $$TarFiles) {"
$psLines += '    Write-Host "[ERROR] No .tar files found in current directory" -ForegroundColor Red'
$psLines += '    Write-Host "  Please upload the exported image files here first." -ForegroundColor Yellow'
$psLines += "    exit 1"
$psLines += "}"
$psLines += 'Write-Host "[IMPORT] Importing images..." -ForegroundColor Cyan'
$psLines += 'Write-Host ""'
$psLines += "foreach ($$tarFile in $$TarFiles) {"
$psLines += '    Write-Host ("  -> Import: " + $$tarFile.Name) -ForegroundColor Yellow'
$psLines += "    docker load -i $$tarFile.FullName"
$psLines += '    Write-Host ""'
$psLines += "}"
$psLines += 'Write-Host "[OK] All images imported!" -ForegroundColor Green'
$psLines += 'Write-Host ""'
$psLines += 'Write-Host "[INFO] PostgreSQL will be pulled from Docker Hub on deploy" -ForegroundColor Yellow'
$psLines += 'Write-Host ""'
$psLines += 'Write-Host "=========================================" -ForegroundColor Cyan'
$psLines += 'Write-Host "  Next Steps" -ForegroundColor Cyan'
$psLines += 'Write-Host "=========================================" -ForegroundColor Cyan'
$psLines += 'Write-Host ""'
$psLines += 'Write-Host "1. Upload docker-compose.yml to server"'
$psLines += 'Write-Host "2. Create .env config file (cp .env.example .env)"'
$psLines += 'Write-Host "3. Start: docker compose up -d"'
$psLines += 'Write-Host ""'

$psPath = $OutputDir + "\import-images.ps1"
$psLines -join "`n" | Out-File -FilePath $psPath -Encoding ASCII
Write-Host ("[OK] Generated Windows import script: " + $psPath) -ForegroundColor Green
Write-Host ""

# Generate upload guide
$fileList = ""
$tarFiles = Get-ChildItem $tarPattern
foreach ($file in $tarFiles) {
    $fileList += "- " + $file.Name + "`n"
}
if ($fileList -eq "") {
    $fileList = "  (no files yet)`n"
}

$guideLines = @()
$guideLines += "========================================"
$guideLines += "  " + $ProjectName.ToUpper() + " Upload Guide"
$guideLines += "========================================"
$guideLines += ""
$guideLines += "Export Time: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
$guideLines += ""
$guideLines += "Files to Upload:"
$guideLines += $fileList.TrimEnd()
$guideLines += "- import-images.ps1 (import script)"
$guideLines += "- docker-compose.yml (deploy config)"
$guideLines += "- .env.example (env template)"
$guideLines += ""
$guideLines += ("Total Size: " + [math]::Round($TotalSize / 1MB, 2).ToString() + " MB")
$guideLines += ""
$guideLines += "========================================"
$guideLines += "  Upload Methods"
$guideLines += "========================================"
$guideLines += ""
$guideLines += "Method 1: WinSCP (Recommended)"
$guideLines += "----------------------"
$guideLines += "1. Download WinSCP: https://winscp.net"
$guideLines += "2. Connect to your server"
$guideLines += "3. Upload files to server dir (e.g. /opt/tokensbyte/):"
$guideLines += "   - All .tar files"
$guideLines += "   - import-images.ps1"
$guideLines += "   - docker-compose.yml"
$guideLines += "   - .env.example"
$guideLines += ""
$guideLines += "Method 2: scp (OpenSSH)"
$guideLines += "----------------------"
$guideLines += "# Run in PowerShell, replace placeholders:"
$guideLines += "# Example: root@192.168.1.100:/opt/tokensbyte/"
$guideLines += ""
$guideLines += "Method 3: Cloud Storage (for large files)"
$guideLines += "----------------------"
$guideLines += "1. Compress:"
$guideLines += ("   Compress-Archive -Path .\docker-images\*" + $Timestamp + ".tar -DestinationPath .\docker-images\" + $ProjectName + "-images-" + $Timestamp + ".zip")
$guideLines += "2. Upload to cloud storage"
$guideLines += "3. Download on server and extract:"
$guideLines += ("   wget <download-url>")
$guideLines += ("   unzip " + $ProjectName + "-images-" + $Timestamp + ".zip")
$guideLines += ""
$guideLines += "========================================"
$guideLines += "  Deployment Steps"
$guideLines += "========================================"
$guideLines += ""
$guideLines += "1. SSH to server:"
$guideLines += "   ssh your-user@your-server"
$guideLines += ""
$guideLines += "2. Enter deploy directory:"
$guideLines += "   cd /path/to/deploy"
$guideLines += ""
$guideLines += "3. Import images:"
$guideLines += "   chmod +x import-images.sh"
$guideLines += "   ./import-images.sh"
$guideLines += "   # or: pwsh import-images.ps1"
$guideLines += ""
$guideLines += "4. Create env file:"
$guideLines += "   cp .env.example .env"
$guideLines += "   nano .env"
$guideLines += ""
$guideLines += "5. Start services:"
$guideLines += "   docker compose up -d"
$guideLines += ""
$guideLines += "6. Check status:"
$guideLines += "   docker compose ps"
$guideLines += "   docker compose logs -f"
$guideLines += ""
$guideLines += "========================================"
$guideLines += "  External Database"
$guideLines += "========================================"
$guideLines += ""
$guideLines += "To use external PostgreSQL (RDS/Cloud DB):"
$guideLines += "1. Update DATABASE_URL in .env"
$guideLines += "   e.g. DATABASE_URL=postgres://user:pass@db.example.com:5432/tokensbyte"
$guideLines += "2. Comment out postgres service in docker-compose.yml"
$guideLines += "3. Remove backend depends_on: postgres"
$guideLines += "4. Start: docker compose up -d"
$guideLines += ""
$guideLines += "========================================"
$guideLines += "  Notes"
$guideLines += "========================================"
$guideLines += ""
$guideLines += "[!] Ensure Docker and Docker Compose are installed on server"
$guideLines += "[!] Change default passwords in .env for production"
$guideLines += "[!] Configure firewall to only expose ports 80/443"
$guideLines += "[!] Regularly backup database volume"
$guideLines += ""
$guideLines += "========================================"

$guidePath = $OutputDir + "\UPLOAD-GUIDE.txt"
$guideLines -join "`n" | Out-File -FilePath $guidePath -Encoding ASCII
Write-Host ("[OK] Generated upload guide: " + $guidePath) -ForegroundColor Green
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[EXPORT]" -ForegroundColor Cyan
Write-Host ("  Directory: " + $OutputDir + "\")
Write-Host ("  Files: " + $tarFiles.Count.ToString() + " image(s)")
Write-Host ("  Total size: " + [math]::Round($TotalSize / 1MB, 2).ToString() + " MB")
Write-Host ""
Write-Host "[NEXT STEPS]" -ForegroundColor Cyan
Write-Host ("  1. View guide: Get-Content " + $guidePath)
Write-Host "  2. Upload files to server (see UPLOAD-GUIDE.txt)"
Write-Host "  3. On server: ./import-images.sh"
Write-Host "  4. Start: docker compose up -d"
Write-Host ""
Write-Host "[TIP] Compress files for faster transfer:" -ForegroundColor Yellow
$zipCmd = "Compress-Archive -Path .\docker-images\*" + $Timestamp + ".tar -DestinationPath .\docker-images\" + $ProjectName + "-images-" + $Timestamp + ".zip"
Write-Host ("  " + $zipCmd)
Write-Host ""

pause

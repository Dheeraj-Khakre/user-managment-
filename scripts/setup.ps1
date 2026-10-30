# One-Click Setup Script for Windows PowerShell
# Usage: .\scripts\setup.ps1

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Node.js Express Secure User Management System Setup     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Node and npm
$nodePath = "C:\Program Files\nodejs\node.exe"
$npmPath = "C:\Program Files\nodejs\npm.cmd"

if (Test-Path $nodePath) {
    Write-Host "[+] Found Node.js executable at $nodePath" -ForegroundColor Green
    & $nodePath -v
} else {
    Write-Warning "[-] Node.js not found at standard path. Checking global PATH..."
    if (Get-Command node -ErrorAction SilentlyContinue) {
        node -v
    } else {
        Write-Error "[-] Node.js is not installed or not in PATH."
        exit 1
    }
}

# 2. Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "[+] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
} else {
    Write-Host "[i] .env file already present." -ForegroundColor White
}

# 3. Create data directory
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" -Force | Out-Null
    Write-Host "[+] Created data directory." -ForegroundColor Green
}

# 4. Install npm dependencies
Write-Host "`n[+] Installing npm dependencies..." -ForegroundColor Cyan
if (Test-Path $npmPath) {
    & $npmPath install
} else {
    npm install
}

# 5. Run database seeder
Write-Host "`n[+] Seeding baseline database with Admin, Moderator, and User accounts..." -ForegroundColor Cyan
if (Test-Path $nodePath) {
    & $nodePath scripts/seed.js
} else {
    node scripts/seed.js
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " Setup complete! Ready to launch.                         " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "To activate the environment:  . .\scripts\activate.ps1" -ForegroundColor Yellow
Write-Host "To start development server:   npm run dev" -ForegroundColor Yellow
Write-Host "To run automated tests:       npm test" -ForegroundColor Yellow

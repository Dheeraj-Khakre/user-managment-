# Node.js Virtual Environment Activation Script (PowerShell)
# Usage: . .\scripts\activate.ps1

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Activating Node.js Project Virtual Environment           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Node.js is in PATH
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\nodejs\node.exe") {
        $env:Path = "C:\Program Files\nodejs;" + $env:Path
        Write-Host "[+] Added C:\Program Files\nodejs to session PATH" -ForegroundColor Green
    } else {
        Write-Warning "[-] Node.js executable not detected. Please verify Node.js installation."
    }
}

# 2. Add local node_modules/.bin to PATH for instant CLI tool access
$nodeModulesBin = Join-Path -Path $PSScriptRoot -ChildPath "..\node_modules\.bin"
if (Test-Path $nodeModulesBin) {
    $fullBinPath = (Resolve-Path $nodeModulesBin).Path
    if ($env:Path -notlike "*$fullBinPath*") {
        $env:Path = "$fullBinPath;" + $env:Path
        Write-Host "[+] Added local node_modules/.bin to session PATH" -ForegroundColor Green
    }
}

# 3. Check and report Node & NPM versions
try {
    $nodeVer = & node -v
    $npmVer = & "C:\Program Files\nodejs\npm.cmd" -v
    Write-Host "[i] Node Version: $nodeVer" -ForegroundColor White
    Write-Host "[i] NPM Version:  $npmVer" -ForegroundColor White
} catch {
    Write-Warning "Failed to query Node/NPM versions: $_"
}

# 4. Check for .env file
$envFile = Join-Path -Path $PSScriptRoot -ChildPath "..\.env"
if (-not (Test-Path $envFile)) {
    $envExample = Join-Path -Path $PSScriptRoot -ChildPath "..\.env.example"
    if (Test-Path $envExample) {
        Copy-Item -Path $envExample -Destination $envFile
        Write-Host "[+] Created .env file from .env.example" -ForegroundColor Yellow
    }
} else {
    Write-Host "[i] Environment file .env detected" -ForegroundColor White
}

# 5. Set custom prompt indicator to simulate virtual environment
if (-not (Test-Path function:global:__old_prompt)) {
    $function:global:__old_prompt = $function:global:prompt
    function global:prompt {
        $orig = & $global:__old_prompt
        return "(node-venv) " + $orig
    }
}

# 6. Deactivation function
function global:deactivate-node {
    if (Test-Path function:global:__old_prompt) {
        $function:global:prompt = $function:global:__old_prompt
        Remove-Item function:global:__old_prompt -ErrorAction SilentlyContinue
    }
    Remove-Item function:global:deactivate-node -ErrorAction SilentlyContinue
    Write-Host "[*] Node.js Virtual Environment Deactivated" -ForegroundColor Yellow
}

Write-Host "`nEnvironment active! Run 'npm run dev' to start the server in development mode." -ForegroundColor Green
Write-Host "Type 'deactivate-node' to leave the virtual environment." -ForegroundColor Gray

# Release script for DenkHub Transcriber (Windows)
# Usage: .\scripts\release.ps1 1.2.6
# Requires: Node.js, npm, git, gh (GitHub CLI)

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path $PSScriptRoot -Parent

Write-Host "=== Release v$Version ===" -ForegroundColor Cyan

# 1. Update version in package.json
Write-Host "[1/6] Aggiorno package.json..."
$pkg = Get-Content "$Root\package.json" -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content "$Root\package.json" -Encoding utf8

# 2. Update version in index.html
Write-Host "[2/6] Aggiorno src/renderer/index.html..."
$html = Get-Content "$Root\src\renderer\index.html" -Raw
$html = $html -replace 'v\d+\.\d+\.\d+', "v$Version"
Set-Content "$Root\src\renderer\index.html" -Value $html -Encoding utf8 -NoNewline

# 3. Build Windows installer
Write-Host "[3/6] Build Windows..." -ForegroundColor Yellow
Push-Location $Root
try {
    npm run build:win
    if ($LASTEXITCODE -ne 0) { throw "npm run build:win failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# 4. Create versioned copy (electron-builder outputs fixed name)
Write-Host "[4/6] Creo copia versionata..."
$src = "$Root\dist\DenkHub-Transcriber-Setup.exe"
$dst = "$Root\dist\DenkHub-Transcriber-Setup-$Version.exe"
Copy-Item $src $dst -Force

# 5. Git commit and push
Write-Host "[5/6] Commit e push..." -ForegroundColor Yellow
Push-Location $Root
try {
    git add package.json src/renderer/index.html
    git commit -m "Bump version to $Version"
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
} finally {
    Pop-Location
}

# 6. Create GitHub release (Windows assets only; add macOS assets separately from Mac)
Write-Host "[6/6] Creo release su GitHub..."
Push-Location $Root
try {
    gh release create "v$Version" `
        "dist/DenkHub-Transcriber-Setup-$Version.exe" `
        "dist/DenkHub-Transcriber-Setup.exe" `
        --title "v$Version" `
        --generate-notes
    if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Release v$Version completata! ===" -ForegroundColor Green
Write-Host "https://github.com/denkhub-io/denkhub-transcriber/releases/tag/v$Version"

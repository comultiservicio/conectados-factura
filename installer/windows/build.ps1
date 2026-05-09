# =============================================================================
# Windows Installer Build Script for Conectados Factura+
# =============================================================================
# 
# Script PowerShell para crear instalador Windows (.exe y .msi)
# Requiere: Node.js 18+, npm, electron-builder
#
# TAREA ADICIONAL: Crear instalador Windows (.exe)
#
# =============================================================================

param(
    [string]$Version = "2.0.0",
    [string]$OutputDir = ".\releases",
    [switch]$SkipTests = $false,
    [switch]$Portable = $false
)

# Error handling
$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success($message) {
    Write-ColorOutput Green "✅ $message"
}

function Write-Info($message) {
    Write-ColorOutput Cyan "ℹ️  $message"
}

function Write-Warning($message) {
    Write-ColorOutput Yellow "⚠️  $message"
}

function Write-Error($message) {
    Write-ColorOutput Red "❌ $message"
}

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Verificando prerequisitos..."
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-Success "Node.js encontrado: $nodeVersion"
    } catch {
        Write-Error "Node.js no encontrado. Instalar desde https://nodejs.org"
        exit 1
    }
    
    # Check npm
    try {
        $npmVersion = npm --version
        Write-Success "npm encontrado: v$npmVersion"
    } catch {
        Write-Error "npm no encontrado"
        exit 1
    }
    
    # Check git
    try {
        $gitVersion = git --version
        Write-Success "Git encontrado"
    } catch {
        Write-Warning "Git no encontrado (opcional)"
    }
}

# Clean previous builds
function Clean-Build {
    Write-Info "Limpiando builds anteriores..."
    
    $dirs = @(
        "..\..\desktop\dist",
        "..\..\desktop\release",
        "..\..\frontend\dist",
        "..\..\backend\dist"
    )
    
    foreach ($dir in $dirs) {
        if (Test-Path $dir) {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Info "Eliminado: $dir"
        }
    }
    
    Write-Success "Limpieza completada"
}

# Install dependencies
function Install-Dependencies {
    Write-Info "Instalando dependencias..."
    
    Set-Location ..\..
    
    # Root dependencies
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    
    # Shared
    Write-Info "Instalando shared..."
    npm ci -w shared
    
    # Backend
    Write-Info "Instalando backend..."
    npm ci -w backend
    
    # Frontend
    Write-Info "Instalando frontend..."
    npm ci -w frontend
    
    # Desktop
    Write-Info "Instalando desktop..."
    npm ci -w desktop
    
    Write-Success "Dependencias instaladas"
}

# Build shared
function Build-Shared {
    Write-Info "Compilando shared types..."
    
    Set-Location ..\..\shared
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Shared build failed" }
    
    Write-Success "Shared compilado"
}

# Build backend
function Build-Backend {
    Write-Info "Compilando backend..."
    
    Set-Location ..\..\backend
    
    # If there's a build script, use it
    if (Test-Path "package.json") {
        $packageJson = Get-Content "package.json" | ConvertFrom-Json
        if ($packageJson.scripts.build) {
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
        }
    }
    
    Write-Success "Backend compilado"
}

# Build frontend
function Build-Frontend {
    Write-Info "Compilando frontend..."
    
    Set-Location ..\..\frontend
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    
    Write-Success "Frontend compilado"
}

# Build desktop with electron-builder
function Build-Desktop {
    Write-Info "Compilando aplicación de escritorio..."
    
    Set-Location ..\..\desktop
    
    # Copy frontend build to desktop's public folder
    if (Test-Path "..\frontend\dist") {
        if (Test-Path ".\public") {
            Remove-Item ".\public\*" -Recurse -Force -ErrorAction SilentlyContinue
            Copy-Item "..\frontend\dist\*" ".\public\" -Recurse -Force
            Write-Info "Frontend build copiado a desktop/public"
        }
    }
    
    # Build desktop
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Desktop build failed" }
    
    # Package with electron-builder
    Write-Info "Creando instalador con electron-builder..."
    
    if ($Portable) {
        npm run dist:portable
    } else {
        npm run dist
    }
    
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
    
    Write-Success "Instalador creado"
}

# Copy releases
function Copy-Releases {
    Write-Info "Copiando instaladores a $OutputDir..."
    
    # Create output directory
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
    
    # Find and copy installers
    $sourceDir = "..\..\desktop\release"
    
    if (Test-Path $sourceDir) {
        $installers = Get-ChildItem -Path $sourceDir -Include *.exe,*.msi,*.zip -Recurse
        
        foreach ($installer in $installers) {
            $destPath = Join-Path $OutputDir $installer.Name
            Copy-Item $installer.FullName $destPath -Force
            Write-Success "Copiado: $($installer.Name)"
        }
        
        # Calculate checksums
        Write-Info "Generando checksums..."
        $checksums = @()
        
        foreach ($file in (Get-ChildItem -Path $OutputDir -File)) {
            $hash = Get-FileHash $file.FullName -Algorithm SHA256
            $checksums += "$($hash.Hash)  $($file.Name)"
        }
        
        $checksums | Out-File (Join-Path $OutputDir "checksums.txt") -Encoding utf8
        Write-Success "Checksums guardados en checksums.txt"
        
    } else {
        Write-Warning "No se encontró directorio de release: $sourceDir"
    }
}

# Create version info file
function New-VersionInfo {
    Write-Info "Creando información de versión..."
    
    $versionInfo = @{
        version = $Version
        buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        nodeVersion = node --version
        platform = "windows"
        files = @()
    }
    
    # Get list of files
    if (Test-Path $OutputDir) {
        $files = Get-ChildItem -Path $OutputDir -File
        $versionInfo.files = $files | ForEach-Object { 
            @{
                name = $_.Name
                size = $_.Length
                modified = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
            }
        }
    }
    
    $versionInfo | ConvertTo-Json -Depth 3 | Out-File (Join-Path $OutputDir "version.json") -Encoding utf8
    Write-Success "version.json creado"
}

# Main build process
function Start-Build {
    Write-Info "🏗️  Iniciando build de Conectados Factura+ v$Version"
    Write-Info "================================================"
    
    # Record start time
    $startTime = Get-Date
    
    try {
        # Steps
        Test-Prerequisites
        Clean-Build
        Install-Dependencies
        Build-Shared
        Build-Backend
        Build-Frontend
        Build-Desktop
        Copy-Releases
        New-VersionInfo
        
        # Calculate duration
        $endTime = Get-Date
        $duration = $endTime - $startTime
        
        Write-Info "================================================"
        Write-Success "Build completado en $($duration.ToString('mm\:ss'))"
        Write-Info "Instaladores en: $((Resolve-Path $OutputDir).Path)"
        Write-Info "================================================"
        
    } catch {
        Write-Error "Build falló: $_"
        Write-Error $_.ScriptStackTrace
        exit 1
    }
}

# Run build
Start-Build

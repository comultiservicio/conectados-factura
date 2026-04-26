# Script para generar iconos desde SVG
# Requiere ImageMagick instalado

param(
    [string]$InputFile = "../assets/icon.svg",
    [string]$OutputDir = "../assets"
)

Write-Host "Generando iconos para Conectados Factura+..." -ForegroundColor Green

# Verificar que ImageMagick está instalado
$magick = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magick) {
    Write-Error "ImageMagick no está instalado. Por favor instálalo desde https://imagemagick.org/"
    exit 1
}

# Crear directorio de salida si no existe
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force
}

# Generar PNGs para Linux
Write-Host "Generando iconos PNG..." -ForegroundColor Cyan
$sizes = @(16, 24, 32, 48, 64, 128, 256, 512)

foreach ($size in $sizes) {
    $outputFile = Join-Path $OutputDir "icons" "${size}x${size}.png"
    $iconsDir = Join-Path $OutputDir "icons"
    
    if (-not (Test-Path $iconsDir)) {
        New-Item -ItemType Directory -Path $iconsDir -Force
    }
    
    magick convert -background none -resize ${size}x${size} $InputFile $outputFile
    Write-Host "  ✓ Generado: ${size}x${size}.png"
}

# Generar icono principal PNG
magick convert -background none -resize 256x256 $InputFile (Join-Path $OutputDir "icon.png")
Write-Host "  ✓ Generado: icon.png (256x256)"

# Generar ICO para Windows (multi-resolución)
Write-Host "Generando icono Windows (.ico)..." -ForegroundColor Cyan
$iconSizes = "256,128,64,48,32,16"
$icoFile = Join-Path $OutputDir "icon.ico"

# Crear ICO con múltiples tamaños
$tempFiles = @()
foreach ($size in @(256, 128, 64, 48, 32, 16)) {
    $tempFile = Join-Path $env:TEMP "icon_${size}.png"
    magick convert -background none -resize ${size}x${size} $InputFile $tempFile
    $tempFiles += $tempFile
}

# Combinar en ICO
magick convert $tempFiles $icoFile
Write-Host "  ✓ Generado: icon.ico"

# Limpiar archivos temporales
$tempFiles | ForEach-Object { Remove-Item $_ -ErrorAction SilentlyContinue }

# Nota sobre ICNS para macOS
Write-Host "`nPara macOS (.icns):" -ForegroundColor Yellow
Write-Host "  macOS requiere iconutil para generar .icns" -ForegroundColor Yellow
Write-Host "  Alternativa: Usar https://cloudconvert.com/png-to-icns" -ForegroundColor Yellow
Write-Host "  O en Mac: iconutil -c icns icon.iconset" -ForegroundColor Yellow

Write-Host "`n✅ Iconos generados exitosamente!" -ForegroundColor Green
Write-Host "Ubicación: $OutputDir" -ForegroundColor Green

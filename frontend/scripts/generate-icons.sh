#!/bin/bash
# Script para generar iconos desde SVG en Linux/Mac
# Requiere ImageMagick instalado

set -e

INPUT_FILE="${1:-../assets/icon.svg}"
OUTPUT_DIR="${2:-../assets}"

echo -e "\033[32mGenerando iconos para Conectados Factura+...\033[0m"

# Verificar que ImageMagick está instalado
if ! command -v convert &> /dev/null; then
    echo -e "\033[31mError: ImageMagick no está instalado\033[0m"
    echo "Instálalo con:"
    echo "  Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "  macOS: brew install imagemagick"
    exit 1
fi

# Crear directorio de salida
mkdir -p "$OUTPUT_DIR/icons"

# Generar PNGs para Linux
echo -e "\033[36mGenerando iconos PNG...\033[0m"
sizes=(16 24 32 48 64 128 256 512)

for size in "${sizes[@]}"; do
    convert -background none -resize ${size}x${size} "$INPUT_FILE" "$OUTPUT_DIR/icons/${size}x${size}.png"
    echo "  ✓ Generado: ${size}x${size}.png"
done

# Generar icono principal PNG
convert -background none -resize 256x256 "$INPUT_FILE" "$OUTPUT_DIR/icon.png"
echo "  ✓ Generado: icon.png (256x256)"

# Generar ICO para Windows (multi-resolución)
echo -e "\033[36mGenerando icono Windows (.ico)...\033[0m"
TEMP_DIR=$(mktemp -d)
for size in 256 128 64 48 32 16; do
    convert -background none -resize ${size}x${size} "$INPUT_FILE" "$TEMP_DIR/icon_${size}.png"
done

# Combinar en ICO
convert "$TEMP_DIR"/*.png "$OUTPUT_DIR/icon.ico"
echo "  ✓ Generado: icon.ico"

# Limpiar
rm -rf "$TEMP_DIR"

# Generar ICNS para macOS (solo en Mac)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "\033[36mGenerando icono macOS (.icns)...\033[0m"
    
    # Crear iconset
    ICONSET_DIR="$OUTPUT_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"
    
    # Generar todas las resoluciones necesarias para macOS
    for size in 16 32 128 256 512; do
        ((size2 = size * 2))
        convert -background none -resize ${size}x${size} "$INPUT_FILE" "$ICONSET_DIR/icon_${size}x${size}.png"
        convert -background none -resize ${size2}x${size2} "$INPUT_FILE" "$ICONSET_DIR/icon_${size}x${size}@2x.png"
    done
    
    # Generar ICNS
    iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_DIR/icon.icns"
    rm -rf "$ICONSET_DIR"
    echo "  ✓ Generado: icon.icns"
else
    echo -e "\033[33m\nPara macOS (.icns):\033[0m"
    echo -e "\033[33m  Este script debe ejecutarse en macOS para generar .icns\033[0m"
    echo -e "\033[33m  Alternativa online: https://cloudconvert.com/png-to-icns\033[0m"
fi

echo -e "\033[32m✅ Iconos generados exitosamente!\033[0m"
echo -e "\033[32mUbicación: $OUTPUT_DIR\033[0m"

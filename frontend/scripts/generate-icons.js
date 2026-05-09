#!/usr/bin/env node
/**
 * Script para generar iconos desde SVG usando Sharp
 * No requiere ImageMagick
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const ICONS_DIR = path.join(ASSETS_DIR, 'icons');
const SVG_INPUT = path.join(ASSETS_DIR, 'icon.svg');

// Asegurar que existan los directorios
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Dimensiones para Linux PNG icons
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

// Dimensiones para Windows ICO (multi-resolution)
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

async function generateLinuxIcons() {
  console.log('🐧 Generando iconos PNG para Linux...');
  
  for (const size of LINUX_SIZES) {
    const outputFile = path.join(ICONS_DIR, `${size}x${size}.png`);
    await sharp(SVG_INPUT)
      .resize(size, size)
      .png()
      .toFile(outputFile);
    console.log(`  ✓ ${size}x${size}.png`);
  }
}

async function generateWindowsIcon() {
  console.log('🪟 Generando icono ICO para Windows...');
  
  // Para ICO necesitamos múltiples tamaños en un solo archivo
  // Sharp no soporta ICO directamente, así que generamos PNGs
  // y usamos un paquete adicional o dejamos que electron-builder
  // use el PNG grande (256x256) como icono para Windows
  
  const outputFile = path.join(ASSETS_DIR, 'icon.png');
  await sharp(SVG_INPUT)
    .resize(256, 256)
    .png()
    .toFile(outputFile);
  console.log(`  ✓ icon.png (256x256) - Usar como icono para Windows`);
  console.log('  ℹ️  Para .ico completo, usar: https://convertio.co/png-ico/');
}

async function generateMacIcon() {
  console.log('🍎 Generando icono para macOS...');
  
  // Para macOS, generamos PNGs en múltiples tamaños
  // Luego se pueden convertir a .icns usando iconutil en Mac
  const macDir = path.join(ICONS_DIR, 'mac');
  if (!fs.existsSync(macDir)) {
    fs.mkdirSync(macDir, { recursive: true });
  }
  
  const macSizes = [16, 32, 64, 128, 256, 512, 1024];
  
  for (const size of macSizes) {
    const outputFile = path.join(macDir, `icon_${size}x${size}.png`);
    await sharp(SVG_INPUT)
      .resize(size, size)
      .png()
      .toFile(outputFile);
    console.log(`  ✓ icon_${size}x${size}.png`);
  }
  
  console.log('  ℹ️  Para .icns en macOS:');
  console.log('     iconutil -c icns icons/mac.iconset');
}

async function main() {
  console.log('🎨 Generando iconos para Conectados Factura+\n');
  
  if (!fs.existsSync(SVG_INPUT)) {
    console.error('❌ No se encontró el archivo SVG:', SVG_INPUT);
    console.log('   Por favor, coloca tu logo en: assets/icon.svg');
    process.exit(1);
  }
  
  try {
    await generateLinuxIcons();
    await generateWindowsIcon();
    await generateMacIcon();
    
    console.log('\n✅ Iconos generados exitosamente!');
    console.log('\n📁 Archivos generados:');
    console.log('   - assets/icon.png (256x256)');
    console.log('   - assets/icons/*.png (varios tamaños)');
    console.log('   - assets/icons/mac/*.png (tamaños macOS)');
    console.log('\n⚠️  Nota: Para instaladores finales:');
    console.log('   - Windows: Convertir icon.png a icon.ico');
    console.log('   - macOS: Crear icon.icns desde los PNGs');
    console.log('   - Usar: https://cloudconvert.com/');
    
  } catch (error) {
    console.error('❌ Error generando iconos:', error.message);
    process.exit(1);
  }
}

main();

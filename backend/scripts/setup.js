#!/usr/bin/env node
/**
 * Setup Script - Conectados Factura+ v2.0
 * 
 * Genera JWT_SECRET seguro y crea archivo .env local
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔧 Conectados Factura+ - Setup inicial\n');

// Verificar si ya existe .env
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (fs.existsSync(envPath)) {
  console.log('⚠️  El archivo .env ya existe. ¿Deseas sobrescribirlo?');
  console.log('   Para preservar la configuración actual, abortando.');
  console.log('   Elimina .env manualmente si deseas regenerarlo.\n');
  process.exit(0);
}

// Generar JWT_SECRET seguro
const jwtSecret = crypto.randomBytes(64).toString('hex');
console.log('✅ JWT_SECRET generado (128 caracteres hex)');

// Leer template
let envContent = fs.readFileSync(envExamplePath, 'utf8');

// Reemplazar placeholder
envContent = envContent.replace(
  'JWT_SECRET=GENERATE_WITH_crypto_randomBytes_64_hex_AND_REPLACE_THIS',
  `JWT_SECRET=${jwtSecret}`
);

// Guardar .env
fs.writeFileSync(envPath, envContent);
console.log('✅ Archivo .env creado con JWT_SECRET seguro\n');

console.log('📋 Próximos pasos:');
console.log('   1. Editar .env con tu configuración real');
console.log('   2. Configurar AFIP_CUIT y certificados si aplica');
console.log('   3. Ejecutar: npm start\n');

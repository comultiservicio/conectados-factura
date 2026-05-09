#!/usr/bin/env node
/**
 * Test de Integración - Conectados Factura+ v2.0
 * 
 * Verifica end-to-end que todos los componentes funcionan:
 * - Health check
 * - Login
 * - Crear producto
 * - Crear cliente
 * - Abrir caja
 * - Crear factura
 * - Verificar integridad
 * - Cerrar caja
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
let token = null;
let productId = null;
let customerId = null;
let cashRegisterId = null;
let invoiceId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function success(msg) {
  console.log(`${colors.green}✅${colors.reset} ${msg}`);
}

function error(msg) {
  console.log(`${colors.red}❌${colors.reset} ${msg}`);
}

function info(msg) {
  console.log(`${colors.cyan}ℹ️${colors.reset} ${msg}`);
}

async function test() {
  console.log('\n🧪 Test de Integración - Conectados Factura+ v2.0\n');
  console.log(`URL Base: ${BASE_URL}\n`);
  
  const startTime = Date.now();
  
  try {
    // 1. Health check
    info('Test 1/8: Health check...');
    const health = await axios.get(`${BASE_URL}/api/health`);
    if (health.data.status !== 'ok') {
      throw new Error(`Health check failed: ${JSON.stringify(health.data)}`);
    }
    success(`Health: ${health.data.status} (${Date.now() - startTime}ms)`);
    
    // 2. Login
    info('Test 2/8: Login...');
    const login = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@conectados.com',
      password: 'admin123'
    });
    
    if (!login.data.token) {
      throw new Error('Login failed: no token received');
    }
    token = login.data.token;
    success(`Login: ${login.data.user?.role || 'admin'} (token received)`);
    
    // 3. Crear producto
    info('Test 3/8: Crear producto...');
    const product = await axios.post(
      `${BASE_URL}/api/products`,
      {
        sku: `TEST${Date.now()}`,
        name: 'Producto Test Integración',
        price: 100,
        ivaRate: 21,
        category: 'general',
        stock: 100
      },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    
    if (!product.data?.data?.id) {
      throw new Error('Product creation failed: no ID received');
    }
    productId = product.data.data.id;
    success(`Producto creado: ID ${productId}`);
    
    // 4. Crear cliente
    info('Test 4/8: Crear cliente...');
    const customer = await axios.post(
      `${BASE_URL}/api/customers`,
      {
        name: 'Cliente Test Integración',
        email: 'test@example.com',
        ivaCondition: 'consumidor_final'
      },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    
    if (!customer.data?.data?.id) {
      throw new Error('Customer creation failed: no ID received');
    }
    customerId = customer.data.data.id;
    success(`Cliente creado: ID ${customerId}`);
    
    // 5. Abrir caja
    info('Test 5/8: Abrir caja...');
    const cash = await axios.post(
      `${BASE_URL}/api/cash-register/open`,
      {
        userId: 1,
        posId: 1,
        initialCash: 1000
      },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    
    if (!cash.data?.data?.id) {
      throw new Error('Cash register open failed');
    }
    cashRegisterId = cash.data.data.id;
    success(`Caja abierta: ID ${cashRegisterId}`);
    
    // 6. Crear factura
    info('Test 6/8: Crear factura...');
    const invoice = await axios.post(
      `${BASE_URL}/api/invoices`,
      {
        customerId: customerId,
        items: [{
          productId: productId,
          quantity: 2,
          unitPrice: 100,
          name: 'Producto Test Integración'
        }],
        paymentMethod: 'cash',
        tipoComprobante: 'factura_b'
      },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    
    if (!invoice.data?.data?.invoiceNumber && !invoice.data?.data?.number) {
      throw new Error('Invoice creation failed: no number received');
    }
    invoiceId = invoice.data.data.id || invoice.data.data.invoiceId;
    const invoiceNumber = invoice.data.data.invoiceNumber || invoice.data.data.number;
    success(`Factura creada: N° ${invoiceNumber}`);
    
    // 7. Verificar integridad
    info('Test 7/8: Verificar integridad...');
    const check = await axios.get(
      `${BASE_URL}/api/debug/invoice-check`,
      { headers: { Authorization: `Bearer ${token}` }}
    );
    
    if (check.data?.health?.status !== 'HEALTHY') {
      throw new Error(`Integrity check failed: ${JSON.stringify(check.data)}`);
    }
    success(`Integridad: ${check.data.health.status}`);
    
    // 8. Cerrar caja
    info('Test 8/8: Cerrar caja...');
    const close = await axios.post(
      `${BASE_URL}/api/cash-register/${cashRegisterId}/close`,
      {
        physicalCash: 1200,
        physicalCoins: 42,
        physicalOther: 0,
        notes: 'Cierre test integración',
        closedBy: 1
      },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    
    if (!close.data?.success) {
      throw new Error('Cash register close failed');
    }
    const difference = close.data.data?.cash_difference || 0;
    success(`Caja cerrada. Diferencia: $${difference.toFixed(2)}`);
    
    // Resultado final
    const totalTime = Date.now() - startTime;
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 TODOS LOS TESTS PASARON (8/8)');
    console.log(`⏱️  Tiempo total: ${totalTime}ms`);
    console.log(`${'='.repeat(60)}\n`);
    
    console.log('📋 Resumen:');
    console.log(`   - Health check: OK`);
    console.log(`   - Login: OK`);
    console.log(`   - Producto: ID ${productId}`);
    console.log(`   - Cliente: ID ${customerId}`);
    console.log(`   - Caja: ID ${cashRegisterId}`);
    console.log(`   - Factura: ID ${invoiceId}`);
    console.log(`   - Integridad: OK`);
    console.log(`   - Cierre: OK (diff: $${difference.toFixed(2)})`);
    console.log('\n✅ Sistema listo para producción!\n');
    
    process.exit(0);
    
  } catch (err) {
    error(`TEST FALLÓ: ${err.message}`);
    
    if (err.response) {
      console.error('\n📄 Detalles del error:');
      console.error(`   Status: ${err.response.status}`);
      console.error(`   Data: ${JSON.stringify(err.response.data, null, 2)}`);
    }
    
    console.error('\n💡 Sugerencias:');
    console.error('   1. Verificar que el backend esté corriendo: npm start');
    console.error('   2. Verificar que no haya errores en consola del backend');
    console.error('   3. Verificar que la base de datos esté inicializada');
    console.error('   4. Verificar JWT_SECRET esté configurado en .env\n');
    
    process.exit(1);
  }
}

// Ejecutar test
test();

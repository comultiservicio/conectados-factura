# Tests End-to-End (E2E) - Conectados Factura+

Esta carpeta contiene los tests end-to-end del proyecto usando Playwright.

## Estructura de Tests

```
tests/e2e/
├── auth.spec.ts      # Tests de autenticación (login/logout)
├── billing.spec.ts   # Tests de facturación (crear/cancelar/descargar)
├── stock.spec.ts     # Tests de stock (productos, alertas, movimientos)
├── payments.spec.ts  # Tests de pagos (Mercado Pago, Stripe, reembolsos)
├── sync.spec.ts      # Tests de sincronización (offline/online)
└── ocr.spec.ts       # Tests de OCR (subir/buscar/ver documentos)
```

## Requisitos Previos

```bash
# Instalar dependencias
npm install

# Instalar navegadores de Playwright
npx playwright install chromium
```

## Comandos para Ejecutar Tests

### Ejecutar todos los tests E2E
```bash
npx playwright test
```

### Ejecutar tests específicos
```bash
# Tests de autenticación
npx playwright test auth.spec.ts

# Tests de facturación
npx playwright test billing.spec.ts

# Tests de stock
npx playwright test stock.spec.ts

# Tests de pagos
npx playwright test payments.spec.ts

# Tests de sincronización
npx playwright test sync.spec.ts

# Tests de OCR
npx playwright test ocr.spec.ts
```

### Ejecutar tests en modo UI (interactivo)
```bash
npx playwright test --ui
```

### Ejecutar tests en modo debug
```bash
npx playwright test --debug
```

### Generar reporte HTML
```bash
npx playwright test
npx playwright show-report
```

## Tests Incluidos

### 1. Autenticación (`auth.spec.ts`)
- ✅ Login válido con credenciales correctas → redirige a dashboard
- ✅ Login inválido muestra mensaje de error
- ✅ Logout limpia sesión y redirige a login

### 2. Facturación (`billing.spec.ts`)
- ✅ Crear factura con ítems válidos → aparece en listado
- ✅ Cancelar factura → estado actualizado
- ✅ Descargar PDF AFIP → archivo generado

### 3. Stock (`stock.spec.ts`)
- ✅ Crear producto nuevo → aparece en inventario
- ✅ Simular stock crítico (<10 unidades) → alerta visible
- ✅ Registrar movimiento → reflejado en tabla

### 4. Pagos (`payments.spec.ts`)
- ✅ Procesar pago con Mercado Pago → estado "Pagado"
- ✅ Procesar pago con Stripe → estado "Pagado"
- ✅ Reembolso → estado actualizado

### 5. Sincronización (`sync.spec.ts`)
- ✅ Simular desconexión → modo offline visible
- ✅ Registrar operación offline → queda en cola
- ✅ Reconectar → sincroniza cola

### 6. OCR (`ocr.spec.ts`)
- ✅ Subir documento PDF → aparece en grid
- ✅ Buscar documento → filtro correcto
- ✅ Abrir modal detalle → datos extraídos visibles

## Configuración

Los tests usan la configuración en `playwright.config.ts`:
- **Base URL**: `http://localhost:5173`
- **Navegador**: Chromium
- **Servidor**: Se inicia automáticamente con `npm run dev`
- **Retry**: 2 reintentos en CI

## Credenciales de Prueba

Los tests usan credenciales de prueba:
- Email: `test@test.com`
- Contraseña: `password123`

**Nota**: Estas credenciales deben estar configuradas en el backend para que los tests pasen.

## CI/CD

Para ejecutar en CI/CD:

```bash
# Instalar dependencias
npm ci

# Instalar Playwright browsers
npx playwright install --with-deps chromium

# Ejecutar tests
npx playwright test

# Generar reporte
npx playwright show-report
```

## Troubleshooting

### Tests fallan por timeouts
Aumentar el timeout en `playwright.config.ts`:
```typescript
use: {
  actionTimeout: 15000,
  navigationTimeout: 30000,
}
```

### Servidor no inicia automáticamente
Iniciar manualmente antes de correr tests:
```bash
npm run dev &
npx playwright test
```

### Elementos no encontrados
Verificar que los selectores (placeholders, textos) coincidan con la UI actual.

## Mantenimiento

Al modificar la UI, actualizar los tests:
1. Identificar el test afectado
2. Actualizar los selectores si cambiaron
3. Verificar que las aserciones reflejan el comportamiento esperado
4. Ejecutar `npx playwright test` para validar

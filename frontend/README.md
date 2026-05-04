# Conectados Factura+ Frontend

Sistema de facturación modular organizado por entornos funcionales, desarrollado con React + TypeScript + Vite.

## Características

### Entornos Funcionales

- **COMPRAS** - Registro de proveedores, órdenes de compra, recepción de mercadería
- **VENTAS** - Cajas, choferes, emisión de comprobantes, listado de ventas
- **RENDICIÓN** - Cierre de caja, arqueo diario, conciliación de ingresos/egresos
- **TESORERÍA** - Pagos, transferencias, gestión de bancos, balances financieros
- **PROCESOS** - Cierre mostrador, cierre fiscal X, cierre diario, envíos, recepción de sucursales, migración de datos

### Funcionalidades Adicionales

- **Dashboard** - Vista general del negocio adaptada por rol
- **Logs de Actividad** - Registro de todas las acciones (solo administrador del sistema)
- **Importar Excel** - Carga masiva de datos
- **Facturación** - Emisión de facturas electrónicas
- **Stock** - Gestión de inventario
- **Documentos OCR** - Lectura de documentos

## Roles de Usuario

| Rol | Entornos Accesibles | Descripción |
|-----|---------------------|-------------|
| **Vendedor/Chofer** | VENTAS | Acceso solo a ventas (subir comprobantes, emitir ventas) |
| **Contador** | RENDICIÓN, TESORERÍA | Acceso a rendición y tesorería |
| **Administrador de Cuenta** | Todos excepto Logs | Acceso a todos los entornos operativos |
| **Administrador del Sistema** | Todos + Logs + Config | Acceso total + panel de configuración de entornos + logs de actividad |

## Usuarios de Prueba

```
vendedor@demo.com    → Vendedor
chofer@demo.com      → Chofer
contador@demo.com    → Contador
tesorero@demo.com    → Tesorero
compras@demo.com     → Encargado de Compras
admin@demo.com       → Administrador de Cuenta
sysadmin@demo.com    → Administrador del Sistema
```

**Contraseñas:** `[usuario]123` (ej: vendedor123)

## Tecnologías

- React 18
- TypeScript
- Vite
- React Router DOM
- Recharts (gráficos)
- Zod (validación)
- XLSX (lectura Excel)
- Lucide React (iconos)

## Instalación

```bash
npm install
```

## Scripts Disponibles

```bash
# Desarrollo
npm run dev

# Build producción
npm run build

# Preview
npm run preview

# Tests
npm run test

# E2E Tests
npm run e2e

# Desktop (Electron)
npm run electron:dev
npm run build:desktop
```

## Estructura del Proyecto

```
src/
├── components/      # Componentes reutilizables
│   ├── ui/           # Componentes UI (Card, Table, ChartContainer)
│   ├── Layout.tsx    # Layout principal con Navbar y Sidebar
│   ├── ImportExcel.tsx  # Importación de datos
│   ├── Alerts.tsx    # Sistema de notificaciones
│   ├── EnvironmentRoute.tsx  # Protección por entorno
│   └── Sidebar.tsx   # Navegación adaptativa por rol
├── pages/            # Páginas de la aplicación
│   ├── Login.tsx     # Pantalla de login con Conectados branding
│   ├── Dashboard.tsx # Dashboard adaptado por rol
│   ├── CameraScanner.tsx  # Cámara para carga de boletas
│   ├── Logs.tsx      # Logs de actividad (admin sistema)
│   ├── Income.tsx    # Módulo de ingresos (Ventas)
│   ├── Expenses.tsx  # Módulo de egresos
│   ├── Totals.tsx    # Cálculos y balances
│   ├── Balance.tsx   # Dashboard financiero
│   ├── Billing.tsx   # Facturación
│   ├── Stock.tsx     # Inventario (Compras)
│   ├── Payments.tsx  # Pagos (Tesorería)
│   └── Sync.tsx      # Sincronización
├── context/        # Contextos (Auth, Theme)
├── services/       # Servicios API
└── styles/         # Estilos globales
```

## Módulos de Facturación

### Ingresos
- Registro de ventas y servicios
- Gráficos de evolución diaria/mensual
- Categorización (ventas, servicios, otros)
- Métodos de pago (efectivo, tarjeta, transferencia, Mercado Pago)
- Validación con Zod

### Egresos
- Registro de compras y gastos
- Categorías (insumos, sueldos, servicios, impuestos, otros)
- Gráficos comparativos
- Control de presupuesto

### Totales
- Cálculo automático: Ingresos - Egresos
- Balance del día seleccionable
- Balance mensual acumulado
- Gráficos comparativos
- Tabla de movimientos diarios

### Balance
- Dashboard financiero completo
- KPIs principales (ingresos, egresos, ahorro)
- Gráficos de evolución mensual
- Distribución por categorías
- Proyecciones anuales

## Importación de Excel

### Características
- Soporte para archivos `.xlsx` y `.csv`
- Mapeo automático de columnas
- Validación de datos con Zod
- Preview antes de importar
- Detección de errores

### Formato Esperado

El archivo debe contener las siguientes columnas:
- `Fecha` - Fecha del movimiento (YYYY-MM-DD)
- `Descripción` - Concepto del ingreso/egreso
- `Monto` - Monto numérico
- `Tipo` - "Ingreso" o "Egreso"

### Ejemplo de Archivo

```csv
Fecha,Descripción,Monto,Tipo
2026-04-27,Venta producto A,1500,Ingreso
2026-04-27,Compra insumos,500,Egreso
2026-04-28,Servicio técnico,2000,Ingreso
2026-04-28,Pago alquiler,800,Egreso
```

### Uso
1. Navegar a "Importar Excel" en el menú lateral
2. Arrastrar o seleccionar archivo
3. Revisar preview de datos
4. Corregir errores si los hay
5. Confirmar importación

### Archivo de Ejemplo

Se incluye `sample-data.xlsx` en la raíz del proyecto como ejemplo.

## Estilo Visual

Diseño inspirado en Apple/Ubiquiti:
- Minimalismo y limpieza
- Tipografía Inter/San Francisco
- Colores suaves (blanco, gris, azul)
- Animaciones sutiles
- Modo oscuro/claro
- Responsive design

## Variables CSS

```css
:root {
  --card-bg: #ffffff;
  --card-border: #e5e7eb;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;
}

[data-theme="dark"] {
  --card-bg: #1f2937;
  --card-border: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-tertiary: #6b7280;
}
```

## Estructura de Entornos

```
src/
├── context/
│   └── AuthContext.tsx          # Sistema de roles y permisos
├── components/
│   ├── EnvironmentRoute.tsx      # Protección por entorno
│   ├── Sidebar.tsx              # Navegación adaptativa por rol
│   └── Logs.tsx                 # Página de logs (solo admin sistema)
├── pages/
│   ├── compras/                 # Entorno COMPRAS
│   │   ├── Proveedores.tsx
│   │   ├── OrdenesCompra.tsx
│   │   └── Recepcion.tsx
│   ├── ventas/                  # Entorno VENTAS
│   │   ├── Cajas.tsx
│   │   ├── Choferes.tsx
│   │   ├── Comprobantes.tsx
│   │   └── ListadoVentas.tsx
│   ├── rendicion/               # Entorno RENDICIÓN
│   │   ├── CierreCaja.tsx
│   │   ├── Arqueo.tsx
│   │   └── Conciliacion.tsx
│   ├── tesoreria/               # Entorno TESORERÍA
│   │   ├── Pagos.tsx
│   │   ├── Transferencias.tsx
│   │   ├── Bancos.tsx
│   │   └── Balances.tsx
│   ├── procesos/                # Entorno PROCESOS
│   │   ├── CierreMostrador.tsx
│   │   ├── CierreFiscal.tsx
│   │   ├── CierreDiario.tsx
│   │   ├── Envios.tsx
│   │   ├── RecepcionSuc.tsx
│   │   └── Migracion.tsx
│   └── Logs.tsx                 # Logs de actividad
```

## Fases de Implementación

### Fase 1 - Ventas y Rendición
- **Entornos:** VENTAS, RENDICIÓN
- **Roles:** vendedor, chofer, contador
- **Funcionalidades:**
  - Cajas, choferes, comprobantes
  - Cierre de caja, arqueo diario
  - Carga de boletas por cámara
  - Logs de ventas y cierres

### Fase 2 - Tesorería y Compras
- **Entornos:** TESORERÍA, COMPRAS
- **Roles:** tesorero, encargado de compras
- **Funcionalidades:**
  - Pagos, transferencias, conciliación bancaria
  - Proveedores, órdenes de compra, recepción
  - Stock con ingreso/egreso de mercadería

### Fase 3 - Procesos Avanzados
- **Entornos:** PROCESOS, Admin
- **Rol:** admin_sistema
- **Funcionalidades:**
  - Cierre mostrador, cierre fiscal X
  - Migración de datos
  - Recepción de sucursales, envíos
  - Integraciones (impresoras fiscales)
  - Panel de configuración y auditoría

## Sistema de Permisos

```typescript
// Roles definidos en AuthContext
type UserRole = 
  | 'vendedor'         // Vendedor/Chofer (Fase 1)
  | 'chofer'           // Chofer (Fase 1)
  | 'contador'         // Contador (Fase 1)
  | 'tesorero'         // Tesorero (Fase 2)
  | 'compras'          // Encargado de compras (Fase 2)
  | 'admin_cuenta'     // Administrador de cuenta
  | 'admin_sistema';   // Administrador del sistema (Fase 3)

// Visibilidad por entorno
interface EnvironmentVisibility {
  enabled: boolean;    // Habilitado: blanco/azul
  visible: boolean;    // Visible en sidebar
  phase: 'fase1' | 'fase2' | 'fase3';
}
```

## Logs de Actividad

- Registro automático de todas las acciones
- Filtros por entorno, usuario, fecha
- Exportación a CSV
- Solo accesible por `system_admin`

## Componentes UI

### Card
```tsx
import { Card, StatCard } from './components/ui';

<Card className="custom-class">
  Content here
</Card>

<StatCard
  title="Ingresos"
  value="$15,000"
  subtitle="Este mes"
  icon={<DollarSign />}
  color="success"
/>
```

### Table
```tsx
import { Table } from './components/ui';

<Table
  data={data}
  columns={[
    { key: 'name', header: 'Nombre', sortable: true },
    { key: 'amount', header: 'Monto', render: (item) => `$${item.amount}` },
  ]}
  searchable={true}
  itemsPerPage={10}
/>
```

## Entorno de Desarrollo

### Variables de Entorno

```env
VITE_API_URL=http://localhost:3000/api
VITE_JWT_SECRET=your-secret-key
```

### Desktop (Electron)

El proyecto incluye configuración para empaquetar como aplicación de escritorio:

```bash
# Desarrollo
npm run electron:dev

# Build para Windows
npm run build:desktop:win

# Build para macOS
npm run build:desktop:mac

# Build para Linux
npm run build:desktop:linux
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests con Playwright
npm run e2e
npm run e2e:ui
```

## Contribución

1. Fork el repositorio
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## Licencia

Proyecto propietario - Conectados

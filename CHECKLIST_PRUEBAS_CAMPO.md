# Checklist de Pruebas en Campo - Conectados Factura+

> Sistema de Facturación Modular con Login, Roles y Entornos por Fase de Implementación
> Versión: 2.0.0 | Fecha: Abril 2026

---

## 1. Login y Autenticación

### 1.1 Acceso al Sistema
- [ ] Abrir aplicación en navegador/desktop/android
- [ ] Verificar que aparece pantalla de login con logo "Conectados Multiservicio"
- [ ] Confirmar estilo Apple/Ubiquiti: gradiente suave, card flotante, inputs redondeados
- [ ] Validar spinner animado al iniciar sesión

### 1.2 Pruebas por Usuario de Prueba

#### Vendedor
- [ ] Login con `vendedor@demo.com` / `vendedor123`
- [ ] Verificar redirección a Dashboard
- [ ] Confirmar mensaje de bienvenida: "¡Bienvenido Juan Vendedor!"
- [ ] Validar que token JWT se guarda en localStorage

#### Chofer
- [ ] Login con `chofer@demo.com` / `chofer123`
- [ ] Verificar acceso a entorno VENTAS
- [ ] Confirmar que puede subir comprobantes desde móvil

#### Contador
- [ ] Login con `contador@demo.com` / `contador123`
- [ ] Verificar acceso a RENDICIÓN
- [ ] Validar que puede ver balances y arqueos

#### Tesorero
- [ ] Login con `tesorero@demo.com` / `tesorero123`
- [ ] Verificar acceso a TESORERÍA
- [ ] Confirmar acceso a pagos y transferencias

#### Encargado de Compras
- [ ] Login con `compras@demo.com` / `compras123`
- [ ] Verificar acceso a COMPRAS
- [ ] Validar que puede registrar proveedores

#### Administrador de Cuenta
- [ ] Login con `admin@demo.com` / `admin123`
- [ ] Verificar acceso a TODOS los entornos operativos
- [ ] Confirmar que NO puede acceder a /logs

#### Administrador del Sistema
- [ ] Login con `sysadmin@demo.com` / `sysadmin123`
- [ ] Verificar acceso TOTAL incluyendo /logs
- [ ] Validar que puede ver auditoría completa

### 1.3 Seguridad de Login
- [ ] Intentar login con credenciales inválidas → mensaje de error
- [ ] Verificar sanitización de inputs (no permite <>, scripts)
- [ ] Validar que contraseña requiere mínimo 6 caracteres
- [ ] Confirmar que el token JWT tiene expiración de 24 horas

---

## 2. Entornos y Navegación

### 2.1 Sidebar y Visibilidad de Entornos

#### Vendedor/Chofer (Fase 1)
- [ ] VENTAS: Habilitado (blanco/azul) ✅
- [ ] RENDICIÓN: Deshabilitado (celeste claro #7dd3fc) con badge "fase1"
- [ ] TESORERÍA: Deshabilitado (celeste claro) con badge "fase2"
- [ ] COMPRAS: Deshabilitado (celeste claro) con badge "fase2"
- [ ] PROCESOS: Deshabilitado (celeste claro) con badge "fase3"
- [ ] Clic en entorno deshabilitado: sin acceso, cursor not-allowed

#### Contador (Fase 1)
- [ ] VENTAS: Deshabilitado (solo visible)
- [ ] RENDICIÓN: Habilitado ✅
- [ ] TESORERÍA: Habilitado ✅
- [ ] COMPRAS: Deshabilitado (fase2)

#### Admin Cuenta (Todas las fases)
- [ ] TODOS los entornos habilitados ✅
- [ ] Badge de rol visible en header del sidebar

### 2.2 Entorno VENTAS (Fase 1)
- [ ] Acceder a `/ventas/cajas`
- [ ] Registrar nueva venta con monto, cliente, producto
- [ ] Verificar que venta aparece en listado
- [ ] Acceder a `/scanner` (Carga Boletas)
- [ ] Probar cámara: marco azul, overlay oscuro, botón captura
- [ ] Capturar imagen de boleta/ticket
- [ ] Verificar que aparece en lista de documentos escaneados
- [ ] Aprobar documento escaneado
- [ ] Validar OCR simulado muestra monto y fecha

### 2.3 Entorno RENDICIÓN (Fase 1)
- [ ] Acceder a `/rendicion/cierre-caja`
- [ ] Registrar cierre de caja con arqueo
- [ ] Verificar cálculo automático de diferencias
- [ ] Acceder a `/rendicion/arqueo`
- [ ] Ver estadísticas diarias
- [ ] Generar reporte de conciliación

### 2.4 Entorno TESORERÍA (Fase 2)
- [ ] Acceder a `/tesoreria/pagos`
- [ ] Registrar nuevo pago a proveedor
- [ ] Verificar listado de pagos pendientes
- [ ] Acceder a `/tesoreria/transferencias`
- [ ] Crear orden de transferencia bancaria
- [ ] Validar conciliación bancaria

### 2.5 Entorno COMPRAS (Fase 2)
- [ ] Acceder a `/compras/proveedores`
- [ ] Registrar nuevo proveedor (nombre, CUIT, contacto)
- [ ] Crear orden de compra
- [ ] Acceder a `/compras/recepcion`
- [ ] Registrar ingreso de mercadería
- [ ] Verificar actualización de stock

### 2.6 Entorno PROCESOS (Fase 3)
- [ ] Acceder a `/procesos/cierre-diario`
- [ ] Ejecutar cierre automático
- [ ] Verificar que se registran logs
- [ ] Acceder a `/procesos/migracion`
- [ ] Cargar archivo Excel de datos históricos
- [ ] Validar importación masiva

---

## 3. Logs y Auditoría

### 3.1 Registro de Actividad
- [ ] Cada login queda registrado con: usuario, timestamp, IP (simulada)
- [ ] Cada venta registrada aparece en logs con entorno "ventas"
- [ ] Cada cierre de caja queda auditado
- [ ] Cada acceso a entorno queda registrado

### 3.2 Acceso a Logs
- [ ] Como sysadmin: acceder a `/logs` ✅
- [ ] Como vendedor: intentar acceder a `/logs` → redirección o acceso denegado
- [ ] Como admin: intentar acceder a `/logs` → acceso denegado

### 3.3 Funcionalidad de Logs
- [ ] Ver tabla de logs con columnas: Fecha, Usuario, Entorno, Acción, Detalles
- [ ] Aplicar filtros por entorno (VENTAS, RENDICIÓN, etc.)
- [ ] Aplicar filtros por usuario
- [ ] Aplicar filtros por rango de fecha
- [ ] Exportar logs a CSV
- [ ] Ver estadísticas: Total logs, Actividad hoy, Entorno más activo

---

## 4. Interfaz y Estilo (UI/UX)

### 4.1 Login
- [ ] Logo "CONECTADOS Factura+" visible y centrado
- [ ] Tagline "Conectados Multiservicio" presente
- [ ] Campos usuario/contraseña con iconos (User, Lock)
- [ ] Botón de mostrar/ocultar contraseña funcional
- [ ] Gradiente de fondo: `#f8fafc` a `#e2e8f0`
- [ ] Card blanca con border-radius 20px
- [ ] Sombra suave: `0 10px 40px rgba(0,0,0,0.08)`
- [ ] Footer con copyright y versión (v2.0.0)

### 4.2 Sidebar
- [ ] Header con título y badge de rol del usuario
- [ ] Entornos habilitados: texto blanco/azul oscuro, hover clicable
- [ ] Entornos deshabilitados: texto **celeste claro #7dd3fc**, opacity 0.5
- [ ] Badge de fase en entornos deshabilitados (fase1/fase2/fase3)
- [ ] Separadores visuales entre secciones
- [ ] Iconos emoji para cada ítem de menú

### 4.3 Cámara / Scanner
- [ ] Vista de cámara activa con video stream
- [ ] Marco de captura: esquinas azules (#3b82f6), 280x180px
- [ ] Overlay oscuro semitransparente
- [ ] Texto "Enfoca el documento dentro del marco"
- [ ] Botón captura: circular, azul, 64px
- [ ] Botón cancelar: circular, gris oscuro, 48px
- [ ] Lista de documentos escaneados en grid
- [ ] Cada documento muestra: thumbnail, tipo, monto, fecha
- [ ] Botones de aprobar/eliminar por documento

### 4.4 Responsive Design
- [ ] Desktop (>1024px): Sidebar expandido, contenido ancho
- [ ] Tablet (768-1024px): Sidebar colapsable, tablas scrollables
- [ ] Mobile (<768px): Sidebar hamburguesa, cards apiladas
- [ ] Cámara se adapta a orientación portrait/landscape

---

## 5. Multi-Plataforma

### 5.1 Versión Web (Navegador)
- [ ] Ejecutar `npm run dev`
- [ ] Abrir en Chrome/Edge/Firefox/Safari
- [ ] Validar funcionalidad completa en cada navegador
- [ ] Verificar que cámara funciona con permisos HTTPS/localhost

### 5.2 Desktop (Electron)
- [ ] Ejecutar `npm run electron:dev`
- [ ] Validar ventana de aplicación se abre
- [ ] Verificar menú nativo (File, Edit, View)
- [ ] Probar atajos de teclado (Ctrl+Alt+L para logout)
- [ ] Crear build para Windows: `npm run build:desktop:win`
- [ ] Crear build para macOS: `npm run build:desktop:mac`
- [ ] Crear build para Linux: `npm run build:desktop:linux`
- [ ] Instalar en cada sistema operativo y probar

### 5.3 Android (PWA)
- [ ] Abrir aplicación en Chrome Android
- [ ] Agregar a pantalla de inicio (Add to Home Screen)
- [ ] Verificar que se instala como PWA
- [ ] Validar que cámara funciona en móvil
- [ ] Probar en modo offline (service worker)
- [ ] Verificar notificaciones push (si aplica)

### 5.4 Tablet (Campo)
- [ ] Probar en tablet Android (10" o similar)
- [ ] Validar uso con pantalla táctil
- [ ] Verificar que cámara integrada funciona
- [ ] Probar escaneo de boletas en campo real
- [ ] Validar firma digital en entregas (si aplica)

---

## 6. VPS AWS - Despliegue Remoto

### 6.1 Configuración AWS Free Tier
- [ ] Crear cuenta AWS (si no existe)
- [ ] Lanzar instancia EC2 t2.micro (Ubuntu 22.04 LTS)
- [ ] Configurar Security Group: puertos 22 (SSH), 80 (HTTP), 443 (HTTPS), 5173 (Dev)
- [ ] Asignar Elastic IP para IP fija
- [ ] Conectar vía SSH: `ssh -i key.pem ubuntu@<elastic-ip>`

### 6.2 Instalación en VPS
```bash
# Checklist de comandos a ejecutar en VPS
- [ ] sudo apt update && sudo apt upgrade -y
- [ ] curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
- [ ] sudo apt install -y nodejs git nginx
- [ ] git clone <repo-url> /var/www/conectados-factura
- [ ] cd /var/www/conectados-factura/frontend
- [ ] npm install
- [ ] npm run build
```

### 6.3 Configuración Nginx
- [ ] Crear archivo `/etc/nginx/sites-available/conectados`
- [ ] Configurar proxy reverso al puerto 5173 (dev) o servir dist/ (prod)
- [ ] Habilitar site: `sudo ln -s /etc/nginx/sites-available/conectados /etc/nginx/sites-enabled/`
- [ ] Testear config: `sudo nginx -t`
- [ ] Reiniciar Nginx: `sudo systemctl restart nginx`

### 6.4 SSL (Certbot)
- [ ] Instalar Certbot: `sudo apt install certbot python3-certbot-nginx`
- [ ] Obtener certificado: `sudo certbot --nginx -d factura.conectados.com`
- [ ] Verificar renovación automática: `sudo certbot renew --dry-run`

### 6.5 Pruebas de Acceso Remoto
- [ ] Acceder desde navegador externo a `http://<elastic-ip>`
- [ ] Validar que carga pantalla de login
- [ ] Probar login con vendedor desde red externa
- [ ] Verificar que entornos se cargan correctamente
- [ ] Probar cámara desde móvil conectado a VPS (HTTPS requerido)
- [ ] Medir tiempo de carga: < 3 segundos ideal

### 6.6 Monitoreo Básico
- [ ] Verificar logs de Nginx: `/var/log/nginx/access.log`
- [ ] Verificar logs de errores: `/var/log/nginx/error.log`
- [ ] Instalar PM2 para manejo de procesos Node: `sudo npm install -g pm2`
- [ ] Configurar PM2 para iniciar automáticamente: `pm2 startup`

---

## 7. Casos de Uso Específicos (Escenarios Reales)

### 7.1 Flujo de Venta Completo
- [ ] Vendedor inicia sesión en tablet
- [ ] Registra venta de producto ($1,500)
- [ ] Cliente paga en efectivo
- [ ] Vendedor accede a cámara y escanea boleta
- [ ] Documento queda guardado y aprobado
- [ ] Log registra: "VENTA registrada - $1,500 - Juan Vendedor"

### 7.2 Cierre de Caja Diario
- [ ] Contador accede a RENDICIÓN > Cierre de Caja
- [ ] Sistema muestra ventas del día: $15,300
- [ ] Contador cuenta efectivo en caja: $15,280
- [ ] Registra diferencia de $20 (faltante)
- [ ] Genera reporte de cierre
- [ ] Log registra: "CIERRE_CAJA - Diferencia: -$20"

### 7.3 Compra a Proveedor
- [ ] Encargado de compras crea orden de compra
- [ ] Selecciona proveedor "Distribuidora ABC"
- [ ] Agrega 50 unidades de Producto X
- [ ] Recibe mercadería en `/compras/recepcion`
- [ ] Actualiza stock automáticamente
- [ ] Log registra: "RECEPCION - 50 unidades - Distribuidora ABC"

---

## 8. Reporte de Bugs y Mejoras

### Formato de Reporte
```
**Bug ID:** BUG-001
**Severidad:** [Crítica | Alta | Media | Baja]
**Entorno:** [VENTAS | RENDICIÓN | TESORERÍA | COMPRAS | PROCESOS]
**Rol:** [vendedor | contador | admin | sysadmin]
**Dispositivo:** [Desktop Windows | Android Samsung | iPad]
**Pasos para reproducir:**
1. Paso 1
2. Paso 2
3. Paso 3

**Resultado esperado:** ...
**Resultado actual:** ...
**Screenshots:** (adjuntar)
```

### Tabla de Resumen
| ID | Descripción | Severidad | Estado | Asignado |
|----|-------------|-----------|--------|----------|
| BUG-001 | Login falla en Safari | Alta | Abierto | Dev Team |
| MEJ-001 | Agregar búsqueda en logs | Media | Pendiente | Product Owner |

---

## 9. Checklist Final de Aprobación

- [ ] **Login:** Todos los usuarios de prueba pueden iniciar sesión
- [ ] **Roles:** Cada rol ve solo sus entornos permitidos
- [ ] **Sidebar:** Entornos deshabilitados aparecen en celeste claro
- [ ] **Ventas:** Se pueden registrar ventas y escanear boletas
- [ ] **Rendición:** Cierre de caja funciona correctamente
- [ ] **Logs:** Solo sysadmin puede acceder, todas las acciones se registran
- [ ] **Multi-plataforma:** Funciona en web, desktop y móvil
- [ ] **AWS:** Sistema desplegado y accesible remotamente
- [ ] **Performance:** Tiempos de carga < 3 segundos
- [ ] **Seguridad:** JWT funciona, datos sanitizados, contraseñas encriptadas

---

## Notas para el Tester

1. **Preparación:** Tener lista de usuarios/contraseñas impresa
2. **Dispositivos:** Probar en mínimo 2 dispositivos diferentes
3. **Red:** Validar funcionamiento en WiFi y datos móviles (4G/5G)
4. **Documentación:** Tomar screenshots de cada paso crítico
5. **Logs:** Revisar consola del navegador (F12) para errores JavaScript
6. **Tiempo:** Estimar 2-3 horas para completar checklist completo

---

## Contacto y Soporte

- **Desarrollo:** [Equipo Conectados]
- **Reportes:** factura+conectados.com
- **Emergencias:** WhatsApp [número de soporte]

---

**Fin del Checklist**

*Generado automáticamente para Conectados Factura+ v2.0.0*

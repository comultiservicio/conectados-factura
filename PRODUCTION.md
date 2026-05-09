# Conectados Factura+ v2.0.0 - Guía de Producción

## 📋 Información General

- **Versión**: 2.0.0
- **Arquitectura**: Local-first (Express + SQLite + Electron + React)
- **Branch**: main
- **Fecha Release**: 2024

## 🖥️ Requisitos del Sistema

### Mínimos
- Windows 10/11 (64-bit)
- 4GB RAM
- 500MB espacio en disco
- Puertos 3000 y 3001 disponibles

### Recomendados
- Windows 11 Pro
- 8GB RAM
- SSD
- Resolución 1920x1080

## 🚀 Instalación

### Opción 1: Instalador Windows (Recomendado)

1. Descargar `Conectados Factura+ Setup 2.0.0.exe`
2. Ejecutar como Administrador
3. Seguir asistente de instalación
4. El sistema se abrirá automáticamente en http://localhost:3000

### Opción 2: Manual (Desarrollo)

```bash
# 1. Clonar repositorio
git clone https://github.com/comultiservicio/conectados-factura.git
cd conectados-factura

# 2. Instalar dependencias
npm install

# 3. Configurar environment
cd backend
copy .env.example .env
# Editar .env con configuración real

# 4. Generar JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copiar output a JWT_SECRET en .env

# 5. Iniciar backend
cd backend
npm start

# 6. En otra terminal, iniciar frontend
cd frontend
npm run dev
```

## ⚙️ Primera Configuración

### 1. Login Inicial
- **URL**: http://localhost:3000
- **Email**: `admin@conectados.com`
- **Password**: `admin123`

### 2. Cambiar Contraseña
Ir a: Configuración → Usuarios → Cambiar Password

### 3. Configurar Empresa
Ir a: Configuración → Empresa
- CUIT
- Razón Social
- Domicilio
- Condición IVA

### 4. Certificados AFIP (Opcional)
Si se va a facturar electrónicamente:
- Obtener certificado de AFIP
- Colocar en `backend/certs/`
- Configurar en `backend/.env`:
  ```
  AFIP_ENV=testing  # Primero testing
  AFIP_CUIT=30XXXXXXXX9
  AFIP_CERT_PATH=./certs/cert.pem
  AFIP_KEY_PATH=./certs/key.pem
  ```

## 💾 Backup Automático

### Configuración
- **Frecuencia**: Cada 10 facturas
- **Ubicación**: `%APPDATA%\Conectados Factura+\backups\`
- **Retención**: Últimos 10 backups
- **Formato**: SQLite .db files

### Backup Manual
```bash
curl http://localhost:3001/api/debug/backup
```

### Restaurar Backup
1. Detener la aplicación
2. Copiar archivo de backup a `database/app.db`
3. Reiniciar aplicación

## 🔧 Troubleshooting

### Puerto 3000/3001 ocupado
```bash
# Buscar proceso
netstat -ano | findstr :3000
# Matar proceso
taskkill /PID <PID> /F
```

### Base de datos bloqueada
```bash
# Verificar WAL files
ls database/*.db-wal database/*.db-shm
# Hacer checkpoint curl http://localhost:3001/api/debug/checkpoint
```

### Error "JWT_SECRET required"
Generar nuevo secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Factura no se crea (queue bloqueado)
Verificar estado:
```bash
curl http://localhost:3001/api/debug/invoice-check
```
Reiniciar servidor si es necesario.

## 📊 Monitoreo

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Estadísticas
```bash
curl http://localhost:3001/api/dashboard/stats
```

### Estado AFIP
```bash
curl http://localhost:3001/api/afip/health
```

## 🔒 Seguridad

### Cambios Requeridos para Producción
1. **Cambiar JWT_SECRET** (obligatorio)
2. **Cambiar password admin** (obligatorio)
3. **Configurar firewall**: Bloquear puertos 3000/3001 desde red externa
4. **Habilitar HTTPS** (si expone a internet)

### Usuarios y Roles
- **admin**: Acceso total
- **manager**: Reportes, análisis
- **cashier**: Ventas, caja
- **driver**: Ventas móvil
- **viewer**: Solo lectura

## 🆘 Soporte

- **Email**: soporteco@chathannah.uk
- **Teléfono**: (011) XXXX-XXXX
- **Horario**: Lunes a Viernes, 9:00-18:00

## 📦 Actualización

### Desde v1.x a v2.0
1. Backup de base de datos v1.x
2. Desinstalar versión anterior
3. Instalar v2.0
4. La DB se migra automáticamente

### Changelog v2.0
- ✅ Arquitectura 100% local (sin AWS)
- ✅ Sistema de roles unificado (5 roles)
- ✅ Integración AFIP WSFEv1
- ✅ Cierre de caja completo
- ✅ Impresión de tickets POS
- ✅ Graceful shutdown
- ✅ Rate limiting
- ✅ Backup automático con verificación

## 📄 Licencia

Conectados Multiservicio - Todos los derechos reservados

---
**Última actualización**: 2024
**Versión documentación**: 2.0.0

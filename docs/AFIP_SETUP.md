# Configuración AFIP - Factura Electrónica Argentina

## Requisitos Previos

1. **CUIT del contribuyente** con inscripción en IVA
2. **Punto de Venta** autorizado en AFIP (presencial o web)
3. **Certificado Digital** emitido por AFIP
4. **Clave privada** (.key)
5. **Certificado público** (.crt o .pem)

---

## Paso 1: Obtener Certificado Digital AFIP

### 1.1 Generar CSR (Certificate Signing Request)

```bash
# En Linux/Mac
openssl genrsa -out key.pem 2048
openssl req -new -key key.pem -out cert.csr \
  -subj "/C=AR/O=Tu Empresa/CN=Tu Nombre/CUIT=20123456789"

# En Windows (usar Git Bash o OpenSSL)
# Mismos comandos
```

### 1.2 Subir CSR a AFIP

1. Ingresar a [AFIP](https://www.afip.gob.ar)
2. "Administrador de Certificados Digitales"
3. "Solicitar Nuevo Certificado"
4. Subir el archivo `cert.csr`
5. Descargar el certificado emitido (`cert.crt`)
6. Convertir a PEM:

```bash
openssl x509 -in cert.crt -out cert.pem -outform PEM
```

---

## Paso 2: Configurar el Sistema

### 2.1 Ubicar Certificados

Copiar los archivos a:
```
backend/certs/
├── cert.pem    (certificado público)
└── key.pem     (clave privada)
```

### 2.2 Configurar Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

```env
AFIP_CUIT=20123456789          # Tu CUIT sin guiones
AFIP_ENV=homo                  # 'homo' para pruebas, 'prod' para producción
AFIP_CERTS_PATH=./certs        # Ruta a certificados
AFIP_DEFAULT_POS=1           # Punto de venta
```

---

## Paso 3: Probar en Homologación

### 3.1 Iniciar el servidor
```bash
cd backend
npm run dev
```

### 3.2 Verificar estado de servidores AFIP
```bash
curl http://localhost:3001/api/afip/health
```

Respuesta esperada:
```json
{
  "success": true,
  "data": {
    "appServer": true,
    "dbServer": true,
    "authServer": true
  }
}
```

### 3.3 Crear factura de prueba
```bash
curl -X POST http://localhost:3001/api/invoices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "type": "B",
    "cliente_nombre": "Consumidor Final",
    "cliente_cuit": "",
    "items": [{"name": "Producto 1", "price": 100}],
    "subtotal": 100,
    "iva": 21,
    "total": 121,
    "user_id": 1
  }'
```

### 3.4 Autorizar con AFIP
```bash
curl -X POST http://localhost:3001/api/afip/authorize/1 \
  -H "Authorization: Bearer TU_TOKEN"
```

---

## Paso 4: API Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/afip/health` | Estado de servidores AFIP |
| `GET /api/afip/pending` | Facturas pendientes de autorización |
| `POST /api/afip/authorize/:id` | Autorizar factura específica |
| `POST /api/afip/retry/:id` | Reintentar factura fallida |
| `GET /api/afip/stats` | Estadísticas de autorización |
| `GET /api/afip/config` | Configuración AFIP actual |
| `GET /api/afip/cron/status` | Estado del servicio cron |
| `POST /api/afip/cron/start` | Iniciar cron de reintentos |
| `POST /api/afip/cron/stop` | Detener cron |

---

## Paso 5: Producción

### 5.1 Cambiar a Ambiente Productivo

1. Solicitar certificado de producción en AFIP
2. Actualizar `.env`:
```env
AFIP_ENV=prod
AFIP_CUIT=TU_CUIT_REAL
```

3. Reiniciar servidor

### 5.2 Monitoreo

El sistema automáticamente:
- Reintenta facturas fallidas cada 5 minutos
- Guarda logs de auditoría en `backend/afip_audit/`
- Genera reportes diarios en la base de datos

---

## Troubleshooting

### Error: "WSAA_AUTH_FAILED"
- Verificar que los certificados sean válidos
- Verificar que el CUIT coincida con el del certificado
- Verificar que los certificados no estén vencidos

### Error: "REJECTED"
- Verificar datos de la factura (CUIT cliente, montos, etc.)
- Consultar código de error específico en [AFIP Errores](https://www.afip.gob.ar/fe/documentos/GuiaWSFEv1.pdf)

### Error de conexión
- Verificar conectividad a internet
- Verificar firewall (puertos 443)
- Probar en navegador: https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl

---

## Estructura de Tablas AFIP

El sistema crea automáticamente:

- `afip_pending` - Facturas pendientes de autorización
- `afip_logs` - Logs de eventos AFIP
- `afip_audit_logs` - Referencias a archivos XML
- `afip_health_logs` - Estado de servidores
- `afip_daily_reports` - Reportes diarios
- `system_alerts` - Alertas del sistema

---

## Documentación AFIP Oficial

- [Web Services AFIP](https://www.afip.gob.ar/ws/)
- [Guía WSFEv1](https://www.afip.gob.ar/fe/documentos/GuiaWSFEv1.pdf)
- [Homologación AFIP](https://www.afip.gob.ar/fe/homologacion/)

---

## Soporte

Para soporte técnico relacionado con AFIP:
- Teléfono AFIP: 0-800-999-2347
- Mesa de Ayuda: [AFIP Contacto](https://www.afip.gob.ar/contacto/)

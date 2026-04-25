# Arquitectura Técnica - Conectados Factura+

## 1. Visión General

Conectados Factura+ es un sistema híbrido de facturación electrónica y gestión de stock diseñado para distribuidoras, supermercados y mayoristas en Argentina. El sistema opera con soporte offline y sincronización automática en la nube mediante AWS.

## 2. Arquitectura AWS

### 2.1 Componentes Principales

#### Frontend - Aplicación Móvil/Desktop
- **Tecnología**: AWS Amplify + React Native
- **Almacenamiento Offline**: AWS Amplify DataStore
- **Autenticación**: Amazon Cognito
- **Sincronización**: Automática al reconectar

#### Backend - API Gateway + Lambda
- **API Gateway**: Endpoint principal REST API
- **AWS Lambda**: Funciones serverless para lógica de negocio
- **Runtime**: Node.js 18.x
- **Arquitectura**: Microservicios desacoplados

#### Base de Datos Híbrida
- **DynamoDB**: Datos transaccionales y sincronización rápida
  - Sesiones de usuario
  - Cache de datos offline
  - Colas de sincronización
- **RDS PostgreSQL**: Datos estructurados persistentes
  - Catálogo de productos
  - Histórico de facturas
  - Gestión de stock
  - Reportes

#### Almacenamiento de Documentos
- **Amazon S3**: Facturas electrónicas y remitos
- **Amazon Textract**: OCR para procesamiento de documentos
- **Versioning**: Habilitado para auditoría

#### Integraciones Externas
- **AFIP**: Facturación electrónica (CAE/CAEA)
- **Mercado Pago**: Pagos QR
- **Stripe**: Pagos internacionales (opcional)
- **Bancos**: Transferencias bancarias

#### Analytics y Monitoreo
- **Amazon QuickSight**: Dashboards y reportes
- **Amazon CloudWatch**: Monitoreo y alertas
- **AWS X-Ray**: Trazabilidad de errores

### 2.2 Diagrama de Arquitectura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   App Móvil     │    │   Web Desktop   │    │   Admin Panel   │
│   (React Native)│    │     (React)     │    │     (React)     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      Amazon Cognito       │
                    │    (Autenticación)        │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      API Gateway         │
                    │   (REST API Endpoints)   │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
│   Lambda Functions│  │   Lambda Functions│  │   Lambda Functions│
│   (Facturación)   │  │   (Stock)         │  │   (Pagos)         │
└─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
│     DynamoDB      │  │       RDS         │  │       S3          │
│   (Sincronización)│  │   (PostgreSQL)    │  │  (Documentos)     │
└───────────────────┘  └───────────────────┘  └───────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Integraciones         │
                    │  AFIP | Mercado Pago      │
                    └───────────────────────────┘
```

## 3. Flujo de Datos

### 3.1 Flujo de Facturación

1. **Captura de Venta** (Offline/Online)
   - App móvil registra venta
   - Datos almacenados localmente en DataStore
   
2. **Sincronización** (Cuando hay conexión)
   - DataStore sincroniza con DynamoDB
   - Lambda procesa cola de facturas pendientes
   
3. **Procesamiento AFIP**
   - Lambda solicita CAE a AFIP
   - Factura generada y almacenada en S3
   - Cliente recibe comprobante

4. **Actualización de Stock**
   - Stock actualizado en RDS
   - Notificación push al chofer

### 3.2 Flujo de Gestión de Stock

1. **Recepción de Mercadería**
   - Chofer escanea remito con cámara
   - Textract extrae datos automáticamente
   - Stock actualizado en tiempo real

2. **Control de Movimientos**
   - Cada venta reduces stock
   - Devoluciones incrementan stock
   - Auditoría completa de movimientos

3. **Reportes**
   - QuickSight genera dashboards
   - Reportes diarios automáticos
   - Alertas de stock bajo

## 4. Especificaciones Técnicas

### 4.1 Configuración AWS Free Tier

| Servicio | Límite Free Tier | Uso Estimado MVP |
|----------|------------------|------------------|
| Lambda | 1M invocaciones/mes | ~50K invocaciones/mes |
| API Gateway | 1M llamadas/mes | ~100K llamadas/mes |
| DynamoDB | 25GB almacenamiento | ~5GB almacenamiento |
| S3 | 5GB almacenamiento | ~2GB almacenamiento |
| RDS | 750 horas/mes | ~500 horas/mes |
| CloudWatch | 10 métricas personalizadas | 5 métricas |

### 4.2 Regiones AWS

- **Desarrollo**: us-east-1 (Virginia) - Menor costo
- **Producción**: sa-east-1 (São Paulo) - Menor latencia Argentina

### 4.3 Moneda y Localización

- **Moneda Principal**: ARS (Pesos Argentinos)
- **Timezone**: America/Argentina/Buenos_Aires
- **Idioma**: Español (Argentina)
- **Formato Fechas**: DD/MM/YYYY

## 5. Seguridad

### 5.1 IAM y Permisos
- Principio de mínimo privilegio
- Roles específicos por función
- MFA habilitado para usuarios admin

### 5.2 Red y VPC
- VPC privada para recursos críticos
- Subnets públicas para API Gateway
- Security Groups restrictivos

### 5.3 Encriptación
- Datos en tránsito: TLS 1.3
- Datos en reposo: AES-256
- Llaves gestionadas por AWS KMS

## 6. Monitoreo y Logging

### 6.1 Métricas Clave
- Tiempo de respuesta API
- Tasa de error por servicio
- Sincronización offline
- Uso de stock en tiempo real

### 6.2 Alertas
- Stock crítico (< 10%)
- Fallos de sincronización
- Errores AFIP
- Pagos fallidos

### 6.3 Dashboards QuickSight
- Ventas diarias/semanales/mensuales
- Movimientos de stock
- Rendimiento por chofer
- Análisis de pagos

## 7. Escalabilidad

### 7.1 Escalado Horizontal
- Lambda auto-scaling
- DynamoDB on-demand
- RDS read replicas

### 7.2 Escalado Vertical
- Migración a RDS Provisión
- DynamoDB capacidad provisionada
- Cache con ElastiCache

## 8. Costos Estimados

### 8.1 MVP (20-50 comprobantes/día)
- **AWS Free Tier**: $0 durante 12 meses
- **Post-Free Tier**: ~$150-200 USD/mes

### 8.2 Producción (100-200 comprobantes/día)
- **Infraestructura**: ~$400-600 USD/mes
- **Integraciones**: ~$100-200 USD/mes
- **Total**: ~$500-800 USD/mes

## 9. Roadmap de Implementación

### Fase 1: MVP (2-3 meses)
- Infraestructura AWS básica
- App móvil con offline
- Facturación AFIP básica
- Gestión de stock simple

### Fase 2: Expansión (3-4 meses)
- Integraciones de pago
- OCR avanzado
- Dashboards completos
- Multi-sucursal

### Fase 3: Escalamiento (4-6 meses)
- Multi-moneda
- Normativas fiscales locales
- Inteligencia artificial
- API para terceros

## 10. Tecnologías Específicas

### Frontend
- React Native 0.72+
- React 18+
- TypeScript
- AWS Amplify v6

### Backend
- Node.js 18.x
- TypeScript
- AWS SDK v3
- Express.js (para API local)

### Base de Datos
- PostgreSQL 15+
- DynamoDB
- Prisma ORM

### DevOps
- AWS CDK
- AWS SAM
- GitHub Actions
- Jest (testing)

## 11. Consideraciones Regulatorias

### AFIP
- Comprobantes fiscales digitales
- CAE en tiempo real
- Resolución General 4.291/2018
- Resolución General 5.582/2022

### Protección de Datos
- Ley de Protección de Datos Personales 25.326
- GDPR (para expansión internacional)
- Backup y recuperación de datos

## 12. Riesgos y Mitigación

### Riesgos Técnicos
- **Conectividad**: Solución offline-first
- **Escalabilidad**: Arquitectura serverless
- **Seguridad**: Múltiples capas de protección

### Riesgos de Negocio
- **Adopción**: Piloto con cliente existente
- **Costos**: Optimización AWS Free Tier
- **Regulación**: Asesoría legal especializada

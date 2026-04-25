# Conectados Factura+

Sistema híbrido de facturación electrónica y gestión de stock con soporte offline y sincronización en la nube (AWS).

## 🏗️ Arquitectura

### Stack Tecnológico
- **Frontend**: React Native + AWS Amplify
- **Backend**: AWS Lambda + API Gateway
- **Base de Datos**: RDS PostgreSQL + DynamoDB
- **Almacenamiento**: Amazon S3
- **Autenticación**: Amazon Cognito
- **OCR**: Amazon Textract
- **Analytics**: Amazon QuickSight
- **Monitoreo**: Amazon CloudWatch

### Diagrama de Arquitectura
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
```

## 🚀 Funcionalidades Principales

### Facturación Electrónica AFIP
- ✅ Facturas A, B y C
- ✅ Generación de CAE en tiempo real
- ✅ Remitos como alternativa
- ✅ Notas de crédito y débito

### Gestión de Stock
- ✅ Control en tiempo real
- ✅ Movimientos por chofer
- ✅ Alertas de stock bajo
- ✅ Auditoría completa

### App Móvil con Offline
- ✅ Soporte completo offline
- ✅ Sincronización automática
- ✅ Registro de ventas y devoluciones
- ✅ GPS y visitas a clientes

### Métodos de Pago
- ✅ Efectivo
- ✅ Transferencias bancarias
- ✅ Posnet
- ✅ QR (Mercado Pago)
- ✅ Stripe (internacional)

### OCR y Documentos
- ✅ Escaneo de facturas/remitos
- ✅ Extracción automática de datos
- ✅ Procesamiento con Amazon Textract

## 📁 Estructura del Proyecto

```
conectados-factura/
├── docs/                          # Documentación técnica
│   ├── arquitectura-tecnica.md    # Arquitectura detallada
│   └── diagramas-flujo.md         # Diagramas y flujos
├── infrastructure/                # AWS CDK Infrastructure
│   ├── bin/                       # CDK entry point
│   ├── lib/                       # CDK stack definitions
│   ├── package.json
│   ├── cdk.json
│   └── tsconfig.json
├── database/                      # Base de datos
│   ├── schema.sql                 # PostgreSQL schema
│   └── dynamodb-schema.json       # DynamoDB schema
├── lambda/                        # Lambda functions
│   ├── auth/                      # Autenticación
│   ├── billing/                   # Facturación AFIP
│   ├── stock/                     # Gestión de stock
│   ├── payments/                  # Procesamiento de pagos
│   ├── sync/                      # Sincronización offline
│   └── ocr/                       # OCR con Textract
├── mobile/                        # React Native app
│   ├── src/
│   │   ├── screens/               # Componentes de pantalla
│   │   ├── services/              # API y servicios
│   │   ├── types/                 # TypeScript types
│   │   └── App.tsx               # App principal
│   └── package.json
├── shared/                        # Tipos compartidos
│   └── types/
│       └── index.ts
└── README.md
```

## 🛠️ Setup y Despliegue

### Prerrequisitos
- Node.js 18+
- AWS CLI configurado
- AWS CDK instalado
- React Native CLI (para desarrollo móvil)

### 1. Configurar AWS
```bash
# Configurar credenciales AWS
aws configure

# Instalar CDK
npm install -g aws-cdk

# Bootstrap CDK (solo primera vez)
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 2. Desplegar Infraestructura
```bash
# Navegar al directorio de infraestructura
cd infrastructure

# Instalar dependencias
npm install

# Desplegar stack
cdk deploy ConectadosFacturaStack
```

### 3. Configurar Base de Datos
```bash
# Conectar a RDS y ejecutar schema
psql -h HOST -U USER -d DATABASE -f database/schema.sql
```

### 4. Desplegar Lambda Functions
```bash
# Build y deploy de cada lambda
cd lambda/billing
npm install
npm run build

# Repetir para cada directorio lambda
```

### 5. Setup App Móvil
```bash
# Navegar al directorio mobile
cd mobile

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales AWS

# Correr en iOS
npm run ios

# Correr en Android
npm run android
```

## 🔧 Configuración de Variables de Entorno

### AWS
```bash
# infrastructure/.env
AWS_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1
```

### Mobile App
```bash
# mobile/.env
API_BASE_URL=https://api.conectadosfactura.com/prod
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxx
USER_POOL_ID=us-east-1_xxxxx
USER_POOL_CLIENT_ID=xxxxx
APPSYNC_ENDPOINT=https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql
APPSYNC_API_KEY=xxxxx
```

## 📊 Costos Estimados (AWS Free Tier)

### MVP (20-50 comprobantes/día)
- **AWS Free Tier**: $0 durante 12 meses
- **Post-Free Tier**: ~$150-200 USD/mes

### Producción (100-200 comprobantes/día)
- **Infraestructura**: ~$400-600 USD/mes
- **Integraciones**: ~$100-200 USD/mes
- **Total**: ~$500-800 USD/mes

## 🔐 Seguridad

### IAM Roles y Permisos
- Principio de mínimo privilegio
- Roles específicos por función
- MFA habilitado para usuarios admin

### Encriptación
- Datos en tránsito: TLS 1.3
- Datos en reposo: AES-256
- Llaves gestionadas por AWS KMS

### Red y VPC
- VPC privada para recursos críticos
- Security Groups restrictivos
- WAF para API Gateway

## 📈 Monitoreo y Alertas

### CloudWatch Metrics
- Tiempo de respuesta API
- Tasa de error por servicio
- Sincronización offline
- Uso de stock en tiempo real

### Alertas Configuradas
- Stock crítico (< 10%)
- Fallos de sincronización
- Errores AFIP
- Pagos fallidos

### Dashboards QuickSight
- Ventas diarias/semanales/mensuales
- Movimientos de stock
- Rendimiento por chofer
- Análisis de pagos

## 🧪 Testing

### Unit Tests
```bash
# Lambda functions
cd lambda/billing
npm test

# Mobile app
cd mobile
npm test
```

### Integration Tests
```bash
# Infrastructure tests
cd infrastructure
npm run test:integration
```

## 🚀 Roadmap de Implementación

### Fase 1: MVP (2-3 meses) ✅
- [x] Infraestructura AWS básica
- [x] App móvil con offline
- [x] Facturación AFIP básica
- [x] Gestión de stock simple

### Fase 2: Expansión (3-4 meses)
- [ ] Integraciones de pago
- [ ] OCR avanzado
- [ ] Dashboards completos
- [ ] Multi-sucursal

### Fase 3: Escalamiento (4-6 meses)
- [ ] Multi-moneda
- [ ] Normativas fiscales locales
- [ ] Inteligencia artificial
- [ ] API para terceros

## 📞 Soporte y Contacto

- **Email**: soporte@conectadosfactura.com
- **Documentación**: docs.conectadosfactura.com
- **Status**: status.conectadosfactura.com

## 📄 Licencia

MIT License - Ver archivo LICENSE para detalles.

---

**Conectados Multiservicio © 2024**

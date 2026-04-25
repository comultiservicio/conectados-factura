# Conectados Factura+

Sistema híbrido de facturación electrónica y gestión de stock con soporte offline y sincronización en la nube (AWS).

## 🚀 **Despliegue Rápido**

### Prerrequisitos
- Node.js 18+
- AWS CLI configurado
- CDK CLI instalado
- PostgreSQL client

### 1. Configurar Variables de Entorno
```bash
# Copiar y configurar archivo de entorno
cp infrastructure/.env.example infrastructure/.env
# Editar infrastructure/.env con tus credenciales AWS
```

### 2. Despliegue Completo (Windows PowerShell)
```powershell
# Ejecutar script de despliegue
.\scripts\deploy.ps1
```

### 3. Despliegue Completo (Linux/Mac)
```bash
# Ejecutar script de despliegue
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### 4. Validación del Despliegue
```bash
# Validar que todo funciona correctamente
./scripts/validate-deployment.sh
```

### 5. Configurar QuickSight
```bash
# Configurar dashboards analíticos
./scripts/setup-quicksight.sh
```

## 🏗️ Arquitectura

### Stack Tecnológico
- **Frontend**: React Native + AWS Amplify
- **Backend**: AWS Lambda + API Gateway (AWS SDK v3)
- **Base de Datos**: RDS PostgreSQL + DynamoDB
- **Almacenamiento**: Amazon S3
- **Autenticación**: Amazon Cognito
- **OCR**: Amazon Textract
- **Analytics**: Amazon QuickSight
- **Monitoreo**: Amazon CloudWatch con alarmas personalizadas

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

## 📊 **Variables de Entorno**

### AWS Credentials (infrastructure/.env)
```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

# Application Secrets
JWT_SECRET=your-super-secret-jwt-key-change-in-production
MERCADO_PAGO_ACCESS_TOKEN=your-mercado-pago-access-token
STRIPE_SECRET_KEY=your-stripe-secret-key
AFIP_CERT=your-afip-certificate-content
AFIP_KEY=your-afip-key-content
AFIP_CUIT=your-afip-cuit-number
```

### Variables de Entorno de Lambda
Las siguientes variables son configuradas automáticamente por CDK:
- `DB_SECRET_ARN`: ARN del secreto de base de datos
- `SYNC_TABLE`: Nombre de tabla DynamoDB de sincronización
- `PAYMENTS_TABLE`: Nombre de tabla DynamoDB de pagos
- `STOCK_MOVEMENTS_TABLE`: Nombre de tabla DynamoDB de movimientos de stock
- `INVOICES_TABLE`: Nombre de tabla DynamoDB de facturas
- `PRODUCTS_TABLE`: Nombre de tabla DynamoDB de productos
- `WAREHOUSES_TABLE`: Nombre de tabla DynamoDB de almacenes
- `DOCUMENTS_TABLE`: Nombre de tabla DynamoDB de documentos
- `OCR_RESULTS_TABLE`: Nombre de tabla DynamoDB de resultados OCR
- `INVOICES_BUCKET`: Nombre de bucket S3 de facturas
- `DOCUMENTS_BUCKET`: Nombre de bucket S3 de documentos
- `USER_POOL_ID`: ID de User Pool de Cognito
- `AWS_REGION`: Región de AWS

## 🚨 **Alarmas CloudWatch Configuradas**

### Alarmas Activas
- **Stock Crítico**: Se activa cuando el stock < 10 unidades
- **Errores AFIP**: Se activa cuando hay > 5 errores AFIP en 5 minutos
- **Fallos de Sincronización**: Se activa cuando hay > 3 fallos en 5 minutos
- **Errores API Gateway**: Se activa cuando hay > 10 errores 5XX en 5 minutos
- **Conexiones RDS**: Se activa cuando hay > 80 conexiones simultáneas

### Notificaciones
- Todas las alarmas envían notificaciones al SNS Topic `ConectadosAlertas`
- Email de alertas: 
  - `conectados@chathannah.uk` - **PENDIENTE DE CONFIRMACIÓN**
  - `soporteco@chathannah.uk` - **PENDIENTE DE CONFIRMACIÓN**
- **ACCIÓN REQUERIDA**: Revisar bandejas de entrada y confirmar suscripciones SNS

## 📈 **Dashboards QuickSight**

### Dashboards Disponibles
- **Sales Dashboard**: Ventas diarias/semanales/mensuales
- **Stock Dashboard**: Movimientos de stock en tiempo real
- **Payments Dashboard**: Análisis de pagos y métodos de pago

### Acceso a Dashboards
1. Iniciar sesión en QuickSight Console
2. Navegar a dashboards compartidos
3. Seleccionar dashboard correspondiente

## 🧪 **Testing Manual**

### Endpoints API
```bash
# Base URL (obtenida del despliegue)
API_BASE_URL="https://api123456789.execute-api.us-east-1.amazonaws.com/prod"

# Health Check
curl "$API_BASE_URL/"

# Autenticación
curl -X POST "$API_BASE_URL/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Crear Factura (requiere token JWT)
curl -X POST "$API_BASE_URL/billing/invoices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"customerId":"uuid","items":[{"productId":"uuid","quantity":2,"unitPrice":100}]}'

# Consultar Stock
curl -X GET "$API_BASE_URL/stock" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Crear Pago
curl -X POST "$API_BASE_URL/payments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"invoiceId":"uuid","amount":1000,"paymentMethod":"mercadopago"}'
```

### Scripts de Testing Automatizados
```bash
# Ejecutar testing completo de endpoints
./scripts/manual-api-testing.sh  # Linux/Mac
.\scripts\manual-api-testing.ps1  # Windows

# Ejecutar validación final del sistema
./scripts/final-validation.sh  # Linux/Mac
```

### Testing de Sincronización Offline
```bash
# Simular fallo de conexión
# 1. Deshabilitar conexión a internet
# 2. Realizar operaciones en la app móvil
# 3. Habilitar conexión
# 4. Verificar que los datos se sincronicen automáticamente

# Verificar estado de sincronización
curl -X GET "$API_BASE_URL/sync/status" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Testing de Alarmas CloudWatch
```bash
# Simular stock crítico (<10 unidades)
curl -X POST "$API_BASE_URL/stock/movements" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"productId":"uuid","warehouseId":"uuid","quantity":-45,"movementType":"OUT"}'

# Verificar notificaciones por email en:
# - conectados@chathannah.uk
# - soporteco@chathannah.uk
```

## 🔧 **Troubleshooting**

### Problemas Comunes

#### 1. Error de Credenciales AWS
```bash
# Verificar configuración de AWS CLI
aws configure list

# Reconfigurar credenciales
aws configure
```

#### 2. Error de CDK Bootstrap
```bash
# Limpiar y ejecutar bootstrap nuevamente
cd infrastructure
cdk bootstrap --force
```

#### 3. Error de Conexión a Base de Datos
```bash
# Verificar estado de RDS
aws rds describe-db-instances --db-instance-identifier conectados-factura-db

# Esperar a que esté disponible
aws rds wait db-instance-available --db-instance-identifier conectados-factura-db
```

#### 4. Error de Lambda Functions
```bash
# Verificar logs de Lambda
aws logs tail /aws/lambda/ConectadosFacturaStack-BillingLambda --follow

# Verificar configuración de variables de entorno
aws lambda get-function-configuration --function-name ConectadosFacturaStack-BillingLambda
```

## 📖 **Guía Rápida para Desarrolladores**

### Estructura del Proyecto
```
conectados-factura/
├── infrastructure/          # CDK Stack y configuración AWS
├── lambda/                 # Funciones Lambda
│   ├── billing/           # Facturación
│   ├── stock/             # Gestión de stock
│   ├── payments/          # Procesamiento de pagos
│   ├── sync/              # Sincronización offline
│   └── ocr/               # Procesamiento OCR
├── database/              # Migraciones PostgreSQL
├── shared/                # Módulos compartidos
├── mobile-app/            # App React Native
├── scripts/               # Scripts de despliegue
└── docs/                  # Documentación técnica
```

### Desarrollo Local

#### 1. Instalar Dependencias
```bash
# Instalar dependencias del proyecto
npm install

# Instalar dependencias de cada Lambda
cd lambda/billing && npm install
cd ../stock && npm install
cd ../payments && npm install
cd ../sync && npm install
cd ../ocr && npm install
```

#### 2. Testing Unitario
```bash
# Ejecutar tests unitarios
npm test

# Ejecutar tests de coverage
npm run test:coverage
```

#### 3. Testing de Integración
```bash
# Ejecutar tests de integración
npm run test:integration
```

### Flujo de Desarrollo

1. **Crear Feature Branch**
```bash
git checkout -b feature/nueva-funcionalidad
```

2. **Desarrollar y Testear**
```bash
# Desarrollar cambios
# Ejecutar tests
npm test
```

3. **Deploy a Staging**
```bash
cd infrastructure
cdk deploy --all --require-approval never
```

4. **Validar y Merge**
```bash
# Validar despliegue
./scripts/validate-deployment.sh

# Merge a main
git checkout main
git merge feature/nueva-funcionalidad
```

## 📞 **Soporte y Contacto**

- **Email de Soporte**: support@conectadosfactura.com
- **Documentación Técnica**: docs.conectadosfactura.com
- **Issues y Bugs**: github.com/conectadosfactura/issues

## 📄 **Licencia**

Este proyecto está licenciado bajo MIT License. Ver archivo LICENSE para más detalles.

---

**Conectados Factura+** - Sistema de facturación electrónica y gestión de stock para distribuidores.
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

## � **Procedimientos de Merge y Despliegue en Producción**

### 📋 **Release v1.0.0 - Publicado**

**Fecha**: April 25, 2026  
**Estado**: ✅ PRODUCTION READY  
**Branch**: feat/security-optimization → main  
**Tag**: v1.0.0

### 🔄 **Proceso de Merge**

#### 1. **Crear Pull Request**
```bash
# Asegurarse de estar en la rama de feature
git checkout feat/security-optimization

# Push de la rama
git push origin feat/security-optimization

# Crear Pull Request en GitHub
# Título: "feat: Merge security optimizations - v1.0.0"
```

#### 2. **Validación de CI/CD**
- ✅ npm audit - 0 vulnerabilidades
- ✅ npm test - 45/45 tests passing
- ✅ npm run build - Compilación exitosa
- ✅ cdk synth - Template validado
- ✅ Snyk scan - 0 vulnerabilidades

#### 3. **Squash Merge**
```bash
# Cambiar a main
git checkout main

# Squash merge desde feat/security-optimization
git merge feat/security-optimization --squash

# Commit con mensaje detallado
git commit -m "feat: Merge security optimizations and comprehensive testing - v1.0.0"

# Push a main
git push origin main
```

#### 4. **Crear Tag de Release**
```bash
# Crear tag v1.0.0
git tag v1.0.0

# Push del tag
git push origin v1.0.0
```

### 🚀 **Despliegue en Producción**

#### 1. **Preparar Variables de Entorno**
```powershell
# Copiar archivo de producción
cp infrastructure/.env.production infrastructure/.env

# Editar con credenciales de producción
# Asegurarse de usar:
# - AWS_ACCESS_KEY_ID (producción)
# - AWS_SECRET_ACCESS_KEY (producción)
# - RDS_HOST (endpoint de producción)
# - S3_BUCKET (bucket de producción)
```

#### 2. **Ejecutar Despliegue**
```powershell
# Ejecutar script de despliegue de producción
.\scripts\deploy.ps1
```

El script ejecuta automáticamente:
1. ✅ Instalación de dependencias
2. ✅ Compilación TypeScript
3. ✅ CDK Bootstrap
4. ✅ CDK Deploy --all
5. ✅ Migraciones PostgreSQL
6. ✅ Validación de endpoints
7. ✅ Configuración de alarmas CloudWatch

#### 3. **Validación Post-Despliegue**
```bash
# Validar endpoints de producción
./scripts/validate-deployment.sh

# Verificar estado del sistema
curl https://api.conectadosfactura.com/
```

### 📊 **Monitoreo de Producción**

#### **Dashboards**
- **CloudWatch**: https://us-east-1.console.aws.amazon.com/cloudwatch
- **Dashboard**: conectados-factura-dashboard
- **QuickSight**: https://us-east-1.quicksight.aws.amazon.com

#### **Alarmas Críticas**
- ✅ StockCriticalAlarm: <10 unidades
- ✅ AFIPErrorsAlarm: >5 errores/5min
- ✅ SyncFailuresAlarm: >3 fallos/5min
- ✅ APIErrorsAlarm: >10 errores 5XX/5min
- ✅ DatabaseConnectionsAlarm: >80 conexiones

#### **Notificaciones SNS**
- **Topic**: ConectadosAlertas
- **Email 1**: conectados@chathannah.uk
- **Email 2**: soporteco@chathannah.uk

### 🎯 **Onboarding de Clientes Piloto**

#### **Timeline de 8 Semanas**
- **Semana 1-2**: Setup y configuración inicial
- **Semana 3-4**: Testing de funcionalidades core
- **Semana 5-6**: Testing offline y sincronización
- **Semana 7-8**: Validación final y feedback

#### **Recursos para Clientes Piloto**
- ✅ Guía de inicio rápido: `PILOT-CUSTOMER-GUIDE.md`
- ✅ Documentación API: Disponible en `/docs`
- ✅ Soporte técnico: soporteco@chathannah.uk

### 🔄 **Rollback Procedures**

#### **Rollback de Infraestructura**
```bash
# Ejecutar rollback de CDK
cdk destroy --all

# Re-desplegar versión anterior
cdk deploy --all
```

#### **Rollback de Base de Datos**
```bash
# Ejecutar script de rollback
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/migrations/001_initial_schema_rollback.sql
```

### 📚 **Documentación de Release**

- **Changelog**: `CHANGELOG-v1.0.0-FINAL.md`
- **Release Notes**: `RELEASE-v1.0.0.md`
- **Testing Report**: `COMPREHENSIVE-TESTING-REPORT.md`
- **Validation Report**: `FINAL-VALIDATION-REPORT.md`
- **Deployment Guide**: `DEPLOYMENT-COMPLETED.md`

---

## 📞 **Soporte y Contacto**

### **Equipo de Soporte**
- **Email Principal**: conectados@chathannah.uk
- **Soporte Técnico**: soporteco@chathannah.uk
- **Documentación**: docs.conectadosfactura.com
- **Status**: status.conectadosfactura.com

### **Recursos de Monitoreo**
- **GitHub**: https://github.com/comultiservicio/conectados-factura
- **CloudWatch**: https://us-east-1.console.aws.amazon.com/cloudwatch
- **QuickSight**: https://us-east-1.quicksight.aws.amazon.com
- **RDS Console**: https://us-east-1.console.aws.amazon.com/rds

---

## 📄 **Licencia**

MIT License - Ver archivo LICENSE para detalles.

---

**Conectados Factura+ © 2024-2026**
**Release v1.0.0 - Production Ready** 🚀

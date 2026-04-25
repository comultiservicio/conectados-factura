# Diagramas de Flujo - Conectados Factura+

## 1. Diagrama de Arquitectura General

```mermaid
graph TB
    subgraph "Cliente"
        A[App Móvil] --> B[Web Desktop]
        B --> C[Admin Panel]
    end
    
    subgraph "AWS Cloud"
        D[Amazon Cognito]
        E[API Gateway]
        F[Lambda Functions]
        G[DynamoDB]
        H[RDS PostgreSQL]
        I[S3 Storage]
        J[Textract OCR]
    end
    
    subgraph "Integraciones Externas"
        K[AFIP]
        L[Mercado Pago]
        M[Stripe]
        N[Bancos]
    end
    
    subgraph "Analytics"
        O[QuickSight]
        P[CloudWatch]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    E --> F
    F --> G
    F --> H
    F --> I
    F --> J
    F --> K
    F --> L
    F --> M
    F --> N
    F --> O
    F --> P
```

## 2. Flujo de Facturación Electrónica

```mermaid
sequenceDiagram
    participant App as App Móvil
    participant DS as DataStore (Offline)
    participant API as API Gateway
    participant Lambda as Lambda Function
    participant AFIP as AFIP WSFE
    participant S3 as S3 Storage
    participant RDS as RDS PostgreSQL
    
    App->>DS: Registrar venta (offline)
    DS->>DS: Guardar localmente
    
    Note over App,S3: Cuando hay conexión
    
    DS->>API: Sincronizar ventas pendientes
    API->>Lambda: Procesar factura
    Lambda->>AFIP: Solicitar CAE
    AFIP->>Lambda: Retornar CAE
    Lambda->>S3: Guardar factura PDF
    Lambda->>RDS: Actualizar registros
    Lambda->>API: Confirmar procesamiento
    API->>DS: Marcar como sincronizado
    DS->>App: Notificar éxito
```

## 3. Flujo de Gestión de Stock

```mermaid
flowchart TD
    A[Recepción de Mercadería] --> B{Escaneo de Remito}
    B -->|Sí| C[Textract OCR]
    B -->|No| D[Ingreso Manual]
    C --> E[Validar Datos]
    D --> E
    E --> F{Datos Correctos?}
    F -->|No| G[Corregir Datos]
    G --> E
    F -->|Sí| H[Actualizar Stock RDS]
    H --> I[Notificar Chofer]
    I --> J[Stock Disponible para Venta]
    
    K[Venta Registrada] --> L[Reducir Stock]
    L --> M{Stock Crítico?}
    M -->|Sí| N[Alerta Automática]
    M -->|No| O[Continuar Ventas]
    N --> P[Notificar Administrador]
    O --> Q[Actualizar Dashboard]
```

## 4. Flujo de Sincronización Offline

```mermaid
stateDiagram-v2
    [*] --> Online
    Online --> Offline: Pérdida de conexión
    Offline --> Online: Conexión restaurada
    
    state Online {
        [*] --> Sincronizando
        Sincronizando --> OperaciónNormal
        OperaciónNormal --> Sincronizando
    }
    
    state Offline {
        [*] --> ModoOffline
        ModoOffline --> AlmacenandoLocal
        AlmacenandoLocal --> ModoOffline
    }
    
    Online --> Offline: Conexión perdida
    Offline --> Online: Conexión restaurada
```

## 5. Flujo de Procesamiento de Pagos

```mermaid
flowchart TD
    A[Venta Confirmada] --> B{Método de Pago}
    B -->|Efectivo| C[Registrar Pago Manual]
    B -->|Transferencia| D[Generar Referencia Bancaria]
    B -->|Posnet| E[Procesar Tarjeta]
    B -->|QR Mercado Pago| F[Generar QR]
    B -->|Stripe| G[Procesar Internacional]
    
    C --> H[Confirmar Pago]
    D --> I[Esperar Confirmación]
    E --> J[Validar Tarjeta]
    F --> K[Esperar Escaneo]
    G --> L[Validar Tarjeta Intl]
    
    H --> M[Actualizar Estado Factura]
    I --> N{Transferencia Recibida?}
    J --> O{Tarjeta Aprobada?}
    K --> P{QR Pagado?}
    L --> Q{Tarjeta Aprobada?}
    
    N -->|Sí| M
    N -->|No| R[Recordatorio Pago]
    O -->|Sí| M
    O -->|No| S[Rechazar Pago]
    P -->|Sí| M
    P -->|No| T[QR Expirado]
    Q -->|Sí| M
    Q -->|No| U[Rechazar Intl]
```

## 6. Flujo de Reportes y Analytics

```mermaid
graph LR
    A[Datos de Ventas] --> B[RDS PostgreSQL]
    C[Datos de Stock] --> B
    D[Datos de Pagos] --> B
    
    B --> E[QuickSight]
    E --> F[Dashboard Ventas]
    E --> G[Dashboard Stock]
    E --> H[Dashboard Pagos]
    
    F --> I[Reporte Diario]
    G --> J[Alertas Stock]
    H --> K[Conciliación]
    
    I --> L[Email Administrador]
    J --> M[Push Chofer]
    K --> N[Contabilidad]
```

## 7. Flujo de Gestión de Usuarios y Permisos

```mermaid
flowchart TD
    A[Usuario Accede] --> B[Cognito Authentication]
    B --> C{Autenticación Exitosa?}
    C -->|No| D[Error de Login]
    C -->|Sí| E[Obtener Permisos IAM]
    E --> F[Cargar Rol de Usuario]
    
    F --> G{Tipo de Usuario}
    G -->|Administrador| H[Acceso Completo]
    G -->|Chofer| I[Ventas y Stock]
    G -->|Cliente| J[Consultas Only]
    
    H --> K[Dashboard Admin]
    I --> L[App Móvil]
    J --> M[Portal Cliente]
```

## 8. Flujo de Backup y Recuperación

```mermaid
sequenceDiagram
    participant RDS as RDS PostgreSQL
    participant S3 as S3 Storage
    participant Backup as AWS Backup
    participant CloudWatch as CloudWatch
    
    Note over RDS,CloudWatch: Backup Automático Diario
    
    RDS->>Backup: Snapshot Automático
    Backup->>S3: Almacenar Backup
    S3->>CloudWatch: Notificar Completado
    
    Note over RDS,CloudWatch: Recuperación ante Desastre
    
    CloudWatch->>Backup: Trigger Recuperación
    Backup->>RDS: Restaurar desde Snapshot
    RDS->>S3: Verificar Integridad
    S3->>CloudWatch: Confirmar Recuperación
```

## 9. Flujo de Monitoreo y Alertas

```mermaid
flowchart TD
    A[Eventos del Sistema] --> B[CloudWatch Logs]
    B --> C[CloudWatch Metrics]
    C --> D{Umbral Excedido?}
    
    D -->|Sí| E[Generar Alerta]
    D -->|No| F[Continuar Monitoreo]
    
    E --> G{Tipo de Alerta}
    G -->|Crítica| H[SNS SMS Inmediato]
    G -->|Advertencia| I[SNS Email]
    G -->|Informativa| J[Dashboard Alertas]
    
    H --> K[Equipo Ops]
    I --> L[Administrador]
    J --> M[Usuario Final]
```

## 10. Flujo de Despliegue CI/CD

```mermaid
graph TB
    subgraph "Desarrollo"
        A[Git Push] --> B[GitHub Actions]
        B --> C[Run Tests]
        C --> D[Build App]
    end
    
    subgraph "Despliegue"
        D --> E[Deploy to Staging]
        E --> F[Run Integration Tests]
        F --> G[Manual Approval]
        G --> H[Deploy to Production]
    end
    
    subgraph "AWS"
        H --> I[Update Lambda Functions]
        H --> J[Update API Gateway]
        H --> K[Update Amplify]
    end
    
    I --> L[Health Check]
    J --> L
    K --> L
    L --> M[Monitor Performance]
```

## 11. Flujo de Escalado Automático

```mermaid
stateDiagram-v2
    [*] --> BajaDemanda
    BajaDemanda --> DemandaModerada: CPU > 60%
    DemandaModerada --> AltaDemanda: CPU > 80%
    AltaDemanda --> DemandaModerada: CPU < 70%
    DemandaModerada --> BajaDemanda: CPU < 40%
    
    state BajaDemanda {
        [*] --> Lambda1_Instancia
        Lambda1_Instancia --> [*]
    }
    
    state DemandaModerada {
        [*] --> Lambda2_Instancias
        Lambda2_Instancias --> [*]
    }
    
    state AltaDemanda {
        [*] --> Lambda4_Instancias
        Lambda4_Instancias --> [*]
    }
```

## 12. Flujo de Auditoría y Cumplimiento

```mermaid
flowchart TD
    A[Operación del Sistema] --> B[Log Evento]
    B --> C[CloudWatch Logs]
    C --> D[Athena Query]
    D --> E[Reporte Auditoría]
    
    F[Factura Generada] --> G[Hash SHA-256]
    G --> H[Blockchain Ledger]
    H --> I[Verificación Integridad]
    
    J[Cambio de Configuración] --> K[IAM Trail]
    K --> L[Security Hub]
    L --> M[Alerta Compliance]
    
    E --> N[Archivo S3 Glacier]
    I --> N
    M --> O[Equipo Seguridad]
```

## 13. Flujo de Integración AFIP

```mermaid
sequenceDiagram
    participant App as App Móvil
    participant Lambda as Lambda AFIP
    participant AFIP as WSFE AFIP
    participant Cert as Certificados
    participant DB as RDS
    
    App->>Lambda: Solicitar CAE
    Lambda->>Cert: Obtener Certificado
    Cert->>Lambda: Certificado Firmado
    Lambda->>AFIP: Enviar Comprobante
    AFIP->>Lambda: Respuesta CAE
    Lambda->>DB: Guardar CAE
    Lambda->>App: Retornar CAE
    
    Note over App,DB: Proceso batch para CAEA
    
    Lambda->>AFIP: Solicitar Lote CAEA
    AFIP->>Lambda: Lote Aprobado
    Lambda->>DB: Actualizar Estado
```

## 14. Flujo de Gestión de Errores

```mermaid
flowchart TD
    A[Error Detectado] --> B{Tipo de Error}
    B -->|Conectividad| C[Reintentar con Backoff]
    B -->|Validación| D[Corregir Datos]
    B -->|Servicio| E[Fallback a Offline]
    B -->|Crítico| F[Escalado Inmediato]
    
    C --> G{Reintento Exitoso?}
    G -->|Sí| H[Continuar Proceso]
    G -->|No| I[Registrar Error]
    
    D --> J{Datos Corregidos?}
    J -->|Sí| H
    J -->|No| I
    
    E --> K[Modo Offline]
    F --> L[Alerta Crítica]
    
    I --> M[Queue para Revisión]
    K --> N[Sincronización Posterior]
    L --> O[Equipo de Emergencia]
```

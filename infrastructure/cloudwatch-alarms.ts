import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export class CloudWatchAlarms extends Construct {
  public readonly stockCriticalAlarm: cloudwatch.Alarm;
  public readonly afipErrorsAlarm: cloudwatch.Alarm;
  public readonly syncFailuresAlarm: cloudwatch.Alarm;
  public readonly apiErrorsAlarm: cloudwatch.Alarm;
  public readonly databaseConnectionsAlarm: cloudwatch.Alarm;
  public readonly alertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: {
    stockLambdaName: string;
    billingLambdaName: string;
    databaseIdentifier: string;
  }) {
    super(scope, id);

    // Crear SNS Topic para alertas con correos específicos
    this.alertsTopic = new sns.Topic(this, 'ConectadosAlertas', {
      displayName: 'Conectados Factura+ Alertas',
      topicName: 'ConectadosAlertas'
    });

    // Añadir suscripciones de email específicas
    this.alertsTopic.addSubscription(new subscriptions.EmailSubscription('conectados@chathannah.uk'));
    this.alertsTopic.addSubscription(new subscriptions.EmailSubscription('soporteco@chathannah.uk'));

    // 1. Alarma de Stock Crítico (< 10 unidades)
    this.stockCriticalAlarm = new cloudwatch.Alarm(this, 'StockCriticalAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'ConectadosFactura',
        metricName: 'StockLevel',
        dimensionsMap: {
          LambdaFunctionName: props.stockLambdaName,
        },
        statistic: 'Minimum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10, // Stock crítico cuando es menor a 10 unidades
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      alarmDescription: 'Stock crítico detectado - Nivel de stock por debajo del umbral mínimo',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 2. Alarma de Errores AFIP (> 5 errores en 5 min)
    this.afipErrorsAlarm = new cloudwatch.Alarm(this, 'AFIPErrorsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'ConectadosFactura',
        metricName: 'AFIPErrors',
        dimensionsMap: {
          LambdaFunctionName: props.billingLambdaName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // Más de 5 errores AFIP en 5 minutos
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      alarmDescription: 'Alta tasa de errores en integración con AFIP',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 3. Alarma de Fallos de Sincronización (> 3 fallos en 5 min)
    this.syncFailuresAlarm = new cloudwatch.Alarm(this, 'SyncFailuresAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'ConectadosFactura',
        metricName: 'SyncFailures',
        dimensionsMap: {
          LambdaFunctionName: props.billingLambdaName, // O usar syncLambdaName
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3, // Más de 3 fallos de sincronización en 5 minutos
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      alarmDescription: 'Múltiples fallos en sincronización offline detectados',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 4. Alarma de Errores de API (> 10 errores en 5 min)
    this.apiErrorsAlarm = new cloudwatch.Alarm(this, 'APIErrorsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: 'ConectadosFacturaAPI',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10, // Más de 10 errores 5XX en 5 minutos
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      alarmDescription: 'Alta tasa de errores en API Gateway',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 5. Alarma de Conexiones de Base de Datos (> 80 conexiones)
    this.databaseConnectionsAlarm = new cloudwatch.Alarm(this, 'DatabaseConnectionsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBInstanceIdentifier: props.databaseIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // Más de 80 conexiones simultáneas
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      alarmDescription: 'Alto número de conexiones a la base de datos',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Configurar acciones de todas las alarmas con el SNS Topic creado
    [this.stockCriticalAlarm, this.afipErrorsAlarm, this.syncFailuresAlarm, 
     this.apiErrorsAlarm, this.databaseConnectionsAlarm].forEach(alarm => {
      alarm.addAlarmAction(new cloudwatch.SnsNotificationAction(this.alertsTopic));
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { RemovalPolicy } from 'aws-cdk-lib';

export class ConectadosFacturaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // === S3 Buckets ===
    const invoicesBucket = new s3.Bucket(this, 'InvoicesBucket', {
      bucketName: 'conectados-factura-invoices',
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: 'conectados-factura-documents',
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // === DynamoDB Tables ===
    const syncTable = new dynamodb.Table(this, 'SyncTable', {
      tableName: 'conectados-sync',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: 'conectados-sessions',
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    const queueTable = new dynamodb.Table(this, 'QueueTable', {
      tableName: 'conectados-queue',
      partitionKey: { name: 'queueId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // === RDS PostgreSQL ===
    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: 'conectados-factura-db-secret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'conectados_admin',
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password',
      },
    });

    const dbSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', { vpcId: 'vpc-xxxxxxxx' }),
      allowAllOutbound: false,
      description: 'Security group for RDS PostgreSQL',
    });

    const database = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier: 'conectados-factura-db',
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: cdk.aws_ec2.InstanceType.of(cdk.aws_ec2.InstanceClass.BURSTABLE3, cdk.aws_ec2.InstanceSize.MICRO),
      vpc: cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', { vpcId: 'vpc-xxxxxxxx' }),
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'conectados_factura',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP2,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // === Cognito User Pool ===
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'conectados-factura-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireNumbers: true,
        requireSymbols: true,
        requireUppercase: true,
        requireLowercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
        refreshToken: true,
      },
    });

    // === Lambda Functions ===
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        DB_SECRET_ARN: dbSecret.secretArn,
        SYNC_TABLE_NAME: syncTable.tableName,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
        QUEUE_TABLE_NAME: queueTable.tableName,
        INVOICES_BUCKET_NAME: invoicesBucket.bucketName,
        DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
      },
    };

    // Auth Lambda
    const authLambda = new lambda.Function(this, 'AuthLambda', {
      ...commonLambdaProps,
      handler: 'auth.handler',
      code: lambda.Code.fromAsset('lambda/auth'),
    });

    // Billing Lambda
    const billingLambda = new lambda.Function(this, 'BillingLambda', {
      ...commonLambdaProps,
      handler: 'billing.handler',
      code: lambda.Code.fromAsset('lambda/billing'),
      timeout: cdk.Duration.minutes(1),
      memorySize: 512,
    });

    // Stock Lambda
    const stockLambda = new lambda.Function(this, 'StockLambda', {
      ...commonLambdaProps,
      handler: 'stock.handler',
      code: lambda.Code.fromAsset('lambda/stock'),
    });

    // Payments Lambda
    const paymentsLambda = new lambda.Function(this, 'PaymentsLambda', {
      ...commonLambdaProps,
      handler: 'payments.handler',
      code: lambda.Code.fromAsset('lambda/payments'),
    });

    // Sync Lambda
    const syncLambda = new lambda.Function(this, 'SyncLambda', {
      ...commonLambdaProps,
      handler: 'sync.handler',
      code: lambda.Code.fromAsset('lambda/sync'),
    });

    // OCR Lambda
    const ocrLambda = new lambda.Function(this, 'OcrLambda', {
      ...commonLambdaProps,
      handler: 'ocr.handler',
      code: lambda.Code.fromAsset('lambda/ocr'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 1024,
    });

    // === Lambda Permissions ===
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permissions to each Lambda
    [authLambda, billingLambda, stockLambda, paymentsLambda, syncLambda, ocrLambda].forEach(fn => {
      syncTable.grantReadWriteData(fn);
      sessionsTable.grantReadWriteData(fn);
      queueTable.grantReadWriteData(fn);
      invoicesBucket.grantReadWrite(fn);
      documentsBucket.grantReadWrite(fn);
      dbSecret.grantRead(fn);
      fn.role!.attachInlinePolicy(
        new iam.Policy(this, `${fn.node.id}Policy`, {
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['rds-db:connect'],
              resources: [database.secret!.secretArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['cognito-idp:*'],
              resources: [userPool.userPoolArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['textract:*'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ses:*', 'sns:*'],
              resources: ['*'],
            }),
          ],
        })
      );
    });

    // === API Gateway ===
    const api = new apigateway.RestApi(this, 'ConectadosFacturaAPI', {
      restApiName: 'Conectados Factura+ API',
      description: 'API para Conectados Factura+',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
    });

    // Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: apigateway.IdentitySource.header('Authorization'),
    });

    // API Resources
    const auth = api.root.addResource('auth');
    const billing = api.root.addResource('billing');
    const stock = api.root.addResource('stock');
    const payments = api.root.addResource('payments');
    const sync = api.root.addResource('sync');
    const ocr = api.root.addResource('ocr');

    // Auth endpoints
    auth.addMethod('POST', new apigateway.LambdaIntegration(authLambda));
    auth.addMethod('GET', new apigateway.LambdaIntegration(authLambda));

    // Billing endpoints
    billing.addMethod('POST', new apigateway.LambdaIntegration(billingLambda), {
      authorizer: cognitoAuthorizer,
    });
    billing.addMethod('GET', new apigateway.LambdaIntegration(billingLambda), {
      authorizer: cognitoAuthorizer,
    });

    // Stock endpoints
    stock.addMethod('POST', new apigateway.LambdaIntegration(stockLambda), {
      authorizer: cognitoAuthorizer,
    });
    stock.addMethod('GET', new apigateway.LambdaIntegration(stockLambda), {
      authorizer: cognitoAuthorizer,
    });

    // Payments endpoints
    payments.addMethod('POST', new apigateway.LambdaIntegration(paymentsLambda), {
      authorizer: cognitoAuthorizer,
    });
    payments.addMethod('GET', new apigateway.LambdaIntegration(paymentsLambda), {
      authorizer: cognitoAuthorizer,
    });

    // Sync endpoints
    sync.addMethod('POST', new apigateway.LambdaIntegration(syncLambda), {
      authorizer: cognitoAuthorizer,
    });
    sync.addMethod('GET', new apigateway.LambdaIntegration(syncLambda), {
      authorizer: cognitoAuthorizer,
    });

    // OCR endpoints
    ocr.addMethod('POST', new apigateway.LambdaIntegration(ocrLambda), {
      authorizer: cognitoAuthorizer,
    });

    // === CloudWatch Alarms ===
    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'APILatencyAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: 'Conectados Factura+ API',
        },
        statistic: 'p90',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 2,
      alarmDescription: 'API latency is too high',
    });

    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: billingLambda.functionName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      alarmDescription: 'Too many Lambda errors',
    });

    // === SNS Topics for Alerts ===
    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      displayName: 'Conectados Factura+ Alerts',
    });

    alertsTopic.addSubscription(new subscriptions.EmailSubscription('alerts@conectadosfactura.com'));

    // === CloudWatch Dashboard ===
    const dashboard = new cloudwatch.Dashboard(this, 'ConectadosFacturaDashboard', {
      dashboardName: 'conectados-factura-dashboard',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Latency',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: {
            ApiName: 'Conectados Factura+ API',
          },
          statistic: 'p90',
          period: cdk.Duration.minutes(5),
        })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: {
            FunctionName: billingLambda.functionName,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database Connections',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'DatabaseConnections',
          dimensionsMap: {
            DBInstanceIdentifier: database.instanceIdentifier,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        left: [new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedReadCapacityUnits',
          dimensionsMap: {
            TableName: syncTable.tableName,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        })],
        right: [new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedWriteCapacityUnits',
          dimensionsMap: {
            TableName: syncTable.tableName,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        })],
        width: 12,
      })
    );

    // === Outputs ===
    new cdk.CfnOutput(this, 'APIEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL endpoint',
    });

    new cdk.CfnOutput(this, 'InvoicesBucketName', {
      value: invoicesBucket.bucketName,
      description: 'S3 bucket for invoices',
    });
  }
}

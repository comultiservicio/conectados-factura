import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudWatch = new CloudWatchClient({});

export class Metrics {
  static async metric(
    name: string, 
    value: number, 
    unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent',
    dimensions?: Record<string, string>
  ) {
    try {
      const metricData = {
        Namespace: 'Conectados/Factura',
        MetricData: [{
          MetricName: name,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: dimensions ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })) : []
        }],
      };

      await cloudWatch.send(new PutMetricDataCommand(metricData));
    } catch (error) {
      console.error('Error sending metric to CloudWatch:', error);
    }
  }

  static async incrementCounter(
    name: string, 
    increment = 1, 
    dimensions?: Record<string, string>
  ) {
    await this.metric(name, increment, 'Count', dimensions);
  }

  static async recordLatency(
    operation: string, 
    latencyMs: number, 
    dimensions?: Record<string, string>
  ) {
    await this.metric(`${operation}Latency`, latencyMs, 'Milliseconds', dimensions);
  }

  static async recordError(
    operation: string, 
    errorType: string, 
    dimensions?: Record<string, string>
  ) {
    await this.metric(`${operation}Error`, 1, 'Count', {
      ...dimensions,
      ErrorType: errorType
    });
  }

  static async recordSuccess(
    operation: string, 
    dimensions?: Record<string, string>
  ) {
    await this.metric(`${operation}Success`, 1, 'Count', dimensions);
  }

  static async recordCacheHit(
    cacheType: 'product' | 'warehouse',
    hit: boolean,
    dimensions?: Record<string, string>
  ) {
    await this.metric(`CacheHit`, hit ? 1 : 0, 'Count', {
      ...dimensions,
      CacheType: cacheType
    });
  }

  static async recordDynamoDBOperation(
    operation: 'Get' | 'Put' | 'Query' | 'BatchGet',
    success: boolean,
    durationMs: number,
    dimensions?: Record<string, string>
  ) {
    await this.metric(`DynamoDB${operation}`, 1, 'Count', {
      ...dimensions,
      Success: success.toString()
    });

    await this.metric(`DynamoDB${operation}Latency`, durationMs, 'Milliseconds', dimensions);
  }

  static async recordAuthAttempt(
    success: boolean,
    role?: string,
    dimensions?: Record<string, string>
  ) {
    await this.metric('AuthAttempt', 1, 'Count', {
      ...dimensions,
      Success: success.toString(),
      Role: role || 'unknown'
    });
  }
}

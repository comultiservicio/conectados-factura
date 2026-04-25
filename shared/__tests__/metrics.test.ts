import { Metrics } from '../metrics';
import { jest } from '@jest/globals';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

// Mock de CloudWatch
jest.mock('@aws-sdk/client-cloudwatch');

const mockCloudWatch = {
  send: jest.fn(),
} as unknown as jest.Mocked<CloudWatchClient>;

describe('Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should send custom metric to CloudWatch', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.metric('CustomMetric', 100, 'Count', { Service: 'Payments' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'CustomMetric',
            Value: 100,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Service', Value: 'Payments' }
            ]
          }]
        })
      })
    );
  });
  
  test('should increment counter metric', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.incrementCounter('UserLogins', 1, { Role: 'user' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'UserLogins',
            Value: 1,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Role', Value: 'user' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record latency metric', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordLatency('DatabaseQuery', 250, { Table: 'Users' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'DatabaseQueryLatency',
            Value: 250,
            Unit: 'Milliseconds',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Table', Value: 'Users' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record error metric', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordError('PaymentProcessing', 'ValidationError', { Method: 'credit_card' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'PaymentProcessingError',
            Value: 1,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Method', Value: 'credit_card' },
              { Name: 'ErrorType', Value: 'ValidationError' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record success metric', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordSuccess('InvoiceCreation', { Company: 'AcmeCorp' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'InvoiceCreationSuccess',
            Value: 1,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Company', Value: 'AcmeCorp' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record cache hit metric', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordCacheHit('product', true, { Region: 'us-east-1' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'CacheHit',
            Value: 1,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Region', Value: 'us-east-1' },
              { Name: 'CacheType', Value: 'product' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record cache miss metric', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordCacheHit('warehouse', false, { Region: 'us-east-1' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Namespace: 'Conectados/Factura',
          MetricData: [{
            MetricName: 'CacheHit',
            Value: 0,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Region', Value: 'us-east-1' },
              { Name: 'CacheType', Value: 'warehouse' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record DynamoDB operation metrics', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordDynamoDBOperation('Get', true, 150, { Table: 'Payments' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledTimes(2); // Success + Latency metrics
    
    // Check success metric
    expect(mockCloudWatch.send).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        input: expect.objectContaining({
          MetricData: [{
            MetricName: 'DynamoDBGet',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              { Name: 'Table', Value: 'Payments' },
              { Name: 'Success', Value: 'true' }
            ]
          }]
        })
      })
    );
    
    // Check latency metric
    expect(mockCloudWatch.send).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        input: expect.objectContaining({
          MetricData: [{
            MetricName: 'DynamoDBGetLatency',
            Value: 150,
            Unit: 'Milliseconds',
            Dimensions: [
              { Name: 'Table', Value: 'Payments' }
            ]
          }]
        })
      })
    );
  });
  
  test('should record auth attempt metrics', async () => {
    mockCloudWatch.send.mockResolvedValue({});
    
    await Metrics.recordAuthAttempt(true, 'user', { Method: 'jwt' });
    
    expect(mockCloudWatch.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          MetricData: [{
            MetricName: 'AuthAttempt',
            Value: 1,
            Unit: 'Count',
            Timestamp: expect.any(Date),
            Dimensions: [
              { Name: 'Method', Value: 'jwt' },
              { Name: 'Success', Value: 'true' },
              { Name: 'Role', Value: 'user' }
            ]
          }]
        })
      })
    );
  });
  
  test('should handle CloudWatch errors gracefully', async () => {
    mockCloudWatch.send.mockRejectedValue(new Error('CloudWatch service unavailable'));
    
    // No debería lanzar error
    await expect(Metrics.metric('TestMetric', 1, 'Count')).resolves.toBeUndefined();
  });
});

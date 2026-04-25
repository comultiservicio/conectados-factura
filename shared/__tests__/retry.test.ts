import { RetryHelper } from '../retry';
import { jest } from '@jest/globals';

describe('RetryHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  test('should succeed on first attempt', async () => {
    const mockOperation = jest.fn().mockResolvedValue('success');
    
    const result = await RetryHelper.withRetry(mockOperation);
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });
  
  test('should retry on ProvisionedThroughputExceededException', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce({ name: 'ProvisionedThroughputExceededException' })
      .mockResolvedValue('success');
    
    const retryPromise = RetryHelper.withRetry(mockOperation, 2, 100);
    
    // Avanzar los timers para simular el delay del retry
    jest.advanceTimersByTime(100);
    
    const result = await retryPromise;
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
  
  test('should retry on ThrottlingException', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce({ name: 'ThrottlingException' })
      .mockResolvedValue('success');
    
    const retryPromise = RetryHelper.withRetry(mockOperation, 2, 100);
    
    // Avanzar los timers para simular el delay del retry
    jest.advanceTimersByTime(100);
    
    const result = await retryPromise;
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
  
  test('should retry on network errors', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET' })
      .mockResolvedValue('success');
    
    const retryPromise = RetryHelper.withRetry(mockOperation, 2, 100);
    
    // Avanzar los timers para simular el delay del retry
    jest.advanceTimersByTime(100);
    
    const result = await retryPromise;
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
  
  test('should retry on 5xx HTTP errors', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValue('success');
    
    const retryPromise = RetryHelper.withRetry(mockOperation, 2, 100);
    
    // Avanzar los timers para simular el delay del retry
    jest.advanceTimersByTime(100);
    
    const result = await retryPromise;
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
  
  test('should fail after max retries', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValue({ name: 'ProvisionedThroughputExceededException' });
    
    const retryPromise = RetryHelper.withRetry(mockOperation, 2, 100);
    
    // Avanzar los timers para todos los reintentos
    jest.advanceTimersByTime(300); // 100 + 200 (exponential backoff)
    
    await expect(retryPromise).rejects.toThrow('Max retries exceeded');
    expect(mockOperation).toHaveBeenCalledTimes(3); // 1 inicial + 2 reintentos
  });
  
  test('should not retry on non-retryable errors', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValue({ name: 'ValidationError' });
    
    await expect(RetryHelper.withRetry(mockOperation, 2)).rejects.toThrow('ValidationError');
    expect(mockOperation).toHaveBeenCalledTimes(1); // Sin reintentos
  });
  
  test('should use exponential backoff', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce({ name: 'ProvisionedThroughputExceededException' })
      .mockRejectedValueOnce({ name: 'ProvisionedThroughputExceededException' })
      .mockResolvedValue('success');
    
    const startTime = Date.now();
    const retryPromise = RetryHelper.withRetry(mockOperation, 2, 100);
    
    // Primer retry (100ms)
    jest.advanceTimersByTime(100);
    
    // Segundo retry (200ms - exponential backoff)
    jest.advanceTimersByTime(200);
    
    const result = await retryPromise;
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });
  
  test('should work with jitter', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce({ name: 'ProvisionedThroughputExceededException' })
      .mockResolvedValue('success');
    
    const retryPromise = RetryHelper.withJitter(mockOperation, 2, 100);
    
    // Avanzar los timers (con jitter adicional)
    jest.advanceTimersByTime(110); // 100ms base + hasta 10ms jitter
    
    const result = await retryPromise;
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
});

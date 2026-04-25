export class RetryHelper {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 100
  ): Promise<T> {
    let retryCount = 0;
    let lastError: Error;
    
    while (retryCount < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Retry on specific errors
        if (this.shouldRetry(error)) {
          retryCount++;
          const delayMs = initialDelayMs * Math.pow(2, retryCount - 1);
          
          console.warn(`Retry attempt ${retryCount}/${maxRetries} after ${delayMs}ms`, {
            error: error.message,
            errorCode: error.name,
            retryCount
          });
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // Don't retry on other errors
        throw error;
      }
    }
    
    throw new Error(`Max retries exceeded. Last error: ${lastError?.message}`);
  }
  
  private static shouldRetry(error: any): boolean {
    // Retry on DynamoDB throttling
    if (error.name === 'ProvisionedThroughputExceededException' ||
        error.name === 'ThrottlingException' ||
        error.name === 'RequestLimitExceeded') {
      return true;
    }
    
    // Retry on network errors
    if (error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Retry on 5xx HTTP errors
    if (error.statusCode >= 500 && error.statusCode < 600) {
      return true;
    }
    
    return false;
  }
  
  static async withJitter<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 100
  ): Promise<T> {
    let retryCount = 0;
    let lastError: Error;
    
    while (retryCount < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        if (this.shouldRetry(error)) {
          retryCount++;
          // Add jitter to prevent thundering herd
          const baseDelay = initialDelayMs * Math.pow(2, retryCount - 1);
          const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
          const delayMs = baseDelay + jitter;
          
          console.warn(`Retry attempt ${retryCount}/${maxRetries} after ${Math.round(delayMs)}ms (with jitter)`, {
            error: error.message,
            errorCode: error.name,
            retryCount
          });
          
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error(`Max retries exceeded. Last error: ${lastError?.message}`);
  }
}

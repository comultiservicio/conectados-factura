import { logger, logError, logInfo, logWarn, logMetric } from '../logger';
import { jest } from '@jest/globals';

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should log info without sensitive data', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation();
    
    logInfo('User login', {
      userId: '123',
      password: 'secret', // Esto no debería aparecer en logs
      email: 'user@example.com',
      token: 'sensitive-token',
      creditCard: '4111-1111-1111-1111'
    });
    
    expect(spy).toHaveBeenCalledWith(
      'User login',
      expect.objectContaining({
        userId: '123',
        email: 'user@example.com',
        password: undefined,
        token: undefined,
        creditCard: undefined,
        bankAccount: undefined,
        socialSecurity: undefined
      })
    );
  });
  
  test('should log error without sensitive data', () => {
    const spy = jest.spyOn(logger, 'error').mockImplementation();
    
    logError('Payment failed', {
      userId: '123',
      amount: 100,
      paymentMethod: 'credit_card',
      cardNumber: '4111-1111-1111-1111', // Esto no debería aparecer
      cvv: '123', // Esto no debería aparecer
      errorMessage: 'Insufficient funds'
    });
    
    expect(spy).toHaveBeenCalledWith(
      'Payment failed',
      expect.objectContaining({
        userId: '123',
        amount: 100,
        paymentMethod: 'credit_card',
        cardNumber: undefined,
        cvv: undefined,
        password: undefined,
        token: undefined,
        creditCard: undefined,
        bankAccount: undefined,
        socialSecurity: undefined
      })
    );
  });
  
  test('should log warning without sensitive data', () => {
    const spy = jest.spyOn(logger, 'warn').mockImplementation();
    
    logWarn('Low stock alert', {
      productId: '456',
      currentStock: 5,
      minStockLevel: 10,
      userId: '123',
      apiKey: 'secret-key' // Esto no debería aparecer
    });
    
    expect(spy).toHaveBeenCalledWith(
      'Low stock alert',
      expect.objectContaining({
        productId: '456',
        currentStock: 5,
        minStockLevel: 10,
        userId: '123',
        apiKey: undefined,
        password: undefined,
        token: undefined,
        creditCard: undefined,
        bankAccount: undefined,
        socialSecurity: undefined
      })
    );
  });
  
  test('should log metrics with partial userId masking', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation();
    
    logMetric('createPayment', 150, true, 'user-123456789');
    
    expect(spy).toHaveBeenCalledWith(
      'Operation completed',
      expect.objectContaining({
        operation: 'createPayment',
        duration: 150,
        success: true,
        userId: 'user-123...', // Parcialmente enmascarado
        timestamp: expect.any(String)
      })
    );
  });
  
  test('should handle empty context', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation();
    
    logInfo('Simple message', {});
    
    expect(spy).toHaveBeenCalledWith(
      'Simple message',
      expect.objectContaining({
        password: undefined,
        token: undefined,
        creditCard: undefined,
        bankAccount: undefined,
        socialSecurity: undefined
      })
    );
  });
  
  test('should preserve non-sensitive data', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation();
    
    logInfo('Order created', {
      orderId: 'order-123',
      customerId: 'customer-456',
      totalAmount: 299.99,
      items: [
        { id: 'item-1', name: 'Product A', price: 199.99 },
        { id: 'item-2', name: 'Product B', price: 100.00 }
      ],
      status: 'pending'
    });
    
    expect(spy).toHaveBeenCalledWith(
      'Order created',
      expect.objectContaining({
        orderId: 'order-123',
        customerId: 'customer-456',
        totalAmount: 299.99,
        items: expect.any(Array),
        status: 'pending',
        password: undefined,
        token: undefined,
        creditCard: undefined,
        bankAccount: undefined,
        socialSecurity: undefined
      })
    );
  });
});

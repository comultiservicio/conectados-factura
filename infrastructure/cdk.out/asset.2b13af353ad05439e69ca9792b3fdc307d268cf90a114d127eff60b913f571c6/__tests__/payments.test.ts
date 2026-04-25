import { PaymentsService } from '../handler';
import { jest } from '@jest/globals';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import * as jwt from 'jsonwebtoken';

// Mock de DynamoDB
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('jsonwebtoken');

const mockDynamoDoc = {
  send: jest.fn(),
} as unknown as jest.Mocked<DynamoDBDocumentClient>;

// Mock de jwt
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('PaymentsService', () => {
  let paymentsService: PaymentsService;
  
  beforeEach(() => {
    paymentsService = new PaymentsService();
    jest.clearAllMocks();
    
    // Mock de jwt.verify
    mockJwt.verify.mockReturnValue({
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'user'
    } as any);
  });
  
  test('should validate user with correct role', async () => {
    const token = 'valid-token';
    const decoded = await paymentsService['validateUser'](token, 'user');
    expect(decoded.role).toBe('user');
    expect(decoded.sub).toBe('test-user-id');
  });
  
  test('should deny access with wrong role', async () => {
    mockJwt.verify.mockReturnValue({
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'user'
    } as any);
    
    const token = 'valid-token';
    await expect(paymentsService['validateUser'](token, 'admin')).rejects.toThrow('Insufficient permissions');
  });
  
  test('should allow user to access their own payment', async () => {
    const token = 'valid-token';
    
    // Mock de DynamoDB: el pago pertenece al usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'test-user-id', amount: 100 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' }
    } as any;
    
    const result = await paymentsService.getPayment(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).data.userId).toBe('test-user-id');
  });
  
  test('should deny access to another user payment', async () => {
    const token = 'valid-token';
    
    // Mock de DynamoDB: el pago pertenece a otro usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'other-user', amount: 100 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' }
    } as any;
    
    const result = await paymentsService.getPayment(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Access denied');
  });
  
  test('should update user payment only if it belongs to them', async () => {
    const token = 'valid-token';
    const paymentData = { amount: 200 };
    
    // Mock de DynamoDB: el pago pertenece al usuario
    mockDynamoDoc.send
      .mockResolvedValueOnce({
        Item: { id: '123', userId: 'test-user-id', amount: 100 }
      })
      .mockResolvedValueOnce({}); // UpdateCommand
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' },
      body: JSON.stringify(paymentData)
    } as any;
    
    const result = await paymentsService.updatePayment(event);
    expect(result.statusCode).toBe(200);
  });
  
  test('should deny update of another user payment', async () => {
    const token = 'valid-token';
    const paymentData = { amount: 200 };
    
    // Mock de DynamoDB: el pago pertenece a otro usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'other-user', amount: 100 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' },
      body: JSON.stringify(paymentData)
    } as any;
    
    const result = await paymentsService.updatePayment(event);
    expect(result.statusCode).toBe(403);
  });
  
  test('should delete user payment only if it belongs to them', async () => {
    const token = 'valid-token';
    
    // Mock de DynamoDB: el pago pertenece al usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'test-user-id', amount: 100 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' }
    } as any;
    
    const result = await paymentsService.deletePayment(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Payment deleted');
  });
  
  test('should deny delete of another user payment', async () => {
    const token = 'valid-token';
    
    // Mock de DynamoDB: el pago pertenece a otro usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'other-user', amount: 100 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' }
    } as any;
    
    const result = await paymentsService.deletePayment(event);
    expect(result.statusCode).toBe(403);
  });
});

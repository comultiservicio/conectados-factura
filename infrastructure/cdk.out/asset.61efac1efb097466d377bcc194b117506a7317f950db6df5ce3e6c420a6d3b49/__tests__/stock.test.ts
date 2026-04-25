import { StockService } from '../handler';
import { jest } from '@jest/globals';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
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

describe('StockService', () => {
  let stockService: StockService;
  
  beforeEach(() => {
    stockService = new StockService();
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
    const decoded = await stockService['validateUser'](token, 'user');
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
    await expect(stockService['validateUser'](token, 'admin')).rejects.toThrow('Insufficient permissions');
  });
  
  test('should allow user to access their own stock movement', async () => {
    const token = 'valid-token';
    
    // Mock de DynamoDB: el movimiento pertenece al usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'test-user-id', productId: '456', quantity: 10 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' }
    } as any;
    
    const result = await stockService.getStockMovement(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).data.userId).toBe('test-user-id');
  });
  
  test('should deny access to another user stock movement', async () => {
    const token = 'valid-token';
    
    // Mock de DynamoDB: el movimiento pertenece a otro usuario
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: '123', userId: 'other-user', productId: '456', quantity: 10 }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      pathParameters: { id: '123' }
    } as any;
    
    const result = await stockService.getStockMovement(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Access denied');
  });
  
  test('should create stock movement with user validation', async () => {
    const token = 'valid-token';
    const movementData = {
      productId: '456',
      warehouseId: '789',
      movementType: 'in',
      quantity: 10
    };
    
    // Mock de DynamoDB
    mockDynamoDoc.send.mockResolvedValueOnce({});
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(movementData)
    } as any;
    
    const result = await stockService.createStockMovement(event);
    expect(result.statusCode).toBe(201);
    
    // Verificar que el movimiento se creó con el userId correcto
    const createdMovement = JSON.parse(result.body).data;
    expect(createdMovement.userId).toBe('test-user-id');
  });
  
  test('should require user role to create stock movement', async () => {
    mockJwt.verify.mockReturnValue({
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'auditor'
    } as any);
    
    const token = 'valid-token';
    const movementData = {
      productId: '456',
      warehouseId: '789',
      movementType: 'in',
      quantity: 10
    };
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(movementData)
    } as any;
    
    const result = await stockService.createStockMovement(event);
    expect(result.statusCode).toBe(401);
  });
});

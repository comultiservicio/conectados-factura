import { PaymentsService } from '../handler';
import { jest } from '@jest/globals';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
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

describe('PaymentsService - BatchGet Optimization', () => {
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
  
  test('should use BatchGetCommand to get user payments', async () => {
    const token = 'valid-token';
    
    // Mock de QueryCommand (para obtener IDs de pagos)
    mockDynamoDoc.send.mockResolvedValueOnce({
      Items: [
        { id: '123', userId: 'test-user-id', amount: 100 },
        { id: '456', userId: 'test-user-id', amount: 200 }
      ]
    });
    
    // Mock de BatchGetCommand (para obtener detalles de pagos)
    mockDynamoDoc.send.mockResolvedValueOnce({
      Responses: {
        'conectados-payments': [
          { id: '123', userId: 'test-user-id', amount: 100 },
          { id: '456', userId: 'test-user-id', amount: 200 }
        ]
      }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` }
    } as any;
    
    const result = await paymentsService.getPayments(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).data.length).toBe(2);
    
    // Verificar que BatchGetCommand fue llamado
    expect(mockDynamoDoc.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          RequestItems: expect.objectContaining({
            'conectados-payments': {
              Keys: [
                { id: '123' },
                { id: '456' }
              ]
            }
          })
        })
      })
    );
  });
  
  test('should handle empty payments list with BatchGet', async () => {
    const token = 'valid-token';
    
    // Mock de QueryCommand (sin resultados)
    mockDynamoDoc.send.mockResolvedValueOnce({
      Items: []
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` }
    } as any;
    
    const result = await paymentsService.getPayments(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).data.length).toBe(0);
    
    // BatchGet no debería ser llamado si no hay IDs
    expect(mockDynamoDoc.send).toHaveBeenCalledTimes(1);
  });
  
  test('should filter payments by user before BatchGet', async () => {
    const token = 'valid-token';
    
    // Mock de QueryCommand (solo pagos del usuario)
    mockDynamoDoc.send.mockResolvedValueOnce({
      Items: [
        { id: '123', userId: 'test-user-id', amount: 100 }
      ]
    });
    
    // Mock de BatchGetCommand
    mockDynamoDoc.send.mockResolvedValueOnce({
      Responses: {
        'conectados-payments': [
          { id: '123', userId: 'test-user-id', amount: 100 }
        ]
      }
    });
    
    const event: APIGatewayProxyEvent = {
      headers: { Authorization: `Bearer ${token}` }
    } as any;
    
    const result = await paymentsService.getPayments(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).data.length).toBe(1);
    
    // Verificar que solo se incluye el pago del usuario
    expect(mockDynamoDoc.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          RequestItems: expect.objectContaining({
            'conectados-payments': {
              Keys: [{ id: '123' }]
            }
          })
        })
      })
    );
  });
});

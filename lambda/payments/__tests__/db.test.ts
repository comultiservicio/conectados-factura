import { PaymentDB } from '../db';
import { jest } from '@jest/globals';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Mock de DynamoDB
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

const mockDynamoDoc = {
  send: jest.fn(),
} as unknown as jest.Mocked<DynamoDBDocumentClient>;

describe('PaymentDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPayment', () => {
    test('should create a new payment successfully', async () => {
      const paymentData = {
        userId: 'test-user',
        invoiceId: 'inv-123',
        amount: 100,
        paymentMethod: 'cash',
        status: 'pending'
      };

      mockDynamoDoc.send.mockResolvedValue({});

      const result = await PaymentDB.createPayment(paymentData);

      expect(result).toMatchObject({
        id: expect.stringMatching(/^payment_\d+_[a-z0-9]+$/),
        ...paymentData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });

      expect(mockDynamoDoc.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'conectados-payments',
            Item: expect.objectContaining(paymentData)
          })
        })
      );
    });

    test('should handle DynamoDB errors during creation', async () => {
      const paymentData = {
        userId: 'test-user',
        invoiceId: 'inv-123',
        amount: 100,
        paymentMethod: 'cash'
      };

      mockDynamoDoc.send.mockRejectedValue(new Error('DynamoDB error'));

      await expect(PaymentDB.createPayment(paymentData)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getPayment', () => {
    test('should retrieve a payment by ID', async () => {
      const paymentId = 'payment-123';
      const expectedPayment = {
        id: paymentId,
        userId: 'test-user',
        amount: 100,
        status: 'completed'
      };

      mockDynamoDoc.send.mockResolvedValue({
        Item: expectedPayment
      });

      const result = await PaymentDB.getPayment(paymentId);

      expect(result).toEqual(expectedPayment);
      expect(mockDynamoDoc.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'conectados-payments',
            Key: { id: paymentId }
          })
        })
      );
    });

    test('should return null for non-existent payment', async () => {
      const paymentId = 'non-existent';

      mockDynamoDoc.send.mockResolvedValue({ Item: undefined });

      const result = await PaymentDB.getPayment(paymentId);

      expect(result).toBeNull();
    });
  });

  describe('updatePayment', () => {
    test('should update an existing payment', async () => {
      const paymentId = 'payment-123';
      const existingPayment = {
        id: paymentId,
        userId: 'test-user',
        amount: 100,
        status: 'pending'
      };
      const updateData = {
        status: 'completed',
        notes: 'Payment received'
      };

      mockDynamoDoc.send
        .mockResolvedValueOnce({ Item: existingPayment }) // getPayment
        .mockResolvedValueOnce({}) // UpdateCommand
        .mockResolvedValueOnce({ Item: { ...existingPayment, ...updateData } }); // getPayment after update

      const result = await PaymentDB.updatePayment(paymentId, updateData);

      expect(result).toMatchObject({
        ...existingPayment,
        ...updateData,
        updatedAt: expect.any(String)
      });

      expect(mockDynamoDoc.send).toHaveBeenCalledTimes(3);
    });

    test('should return null for non-existent payment', async () => {
      const paymentId = 'non-existent';
      const updateData = { status: 'completed' };

      mockDynamoDoc.send.mockResolvedValue({ Item: undefined });

      const result = await PaymentDB.updatePayment(paymentId, updateData);

      expect(result).toBeNull();
    });
  });

  describe('deletePayment', () => {
    test('should delete an existing payment', async () => {
      const paymentId = 'payment-123';
      const existingPayment = {
        id: paymentId,
        userId: 'test-user',
        amount: 100
      };

      mockDynamoDoc.send
        .mockResolvedValueOnce({ Item: existingPayment }) // getPayment
        .mockResolvedValueOnce({}); // DeleteCommand

      const result = await PaymentDB.deletePayment(paymentId);

      expect(result).toBe(true);
      expect(mockDynamoDoc.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'conectados-payments',
            Key: { id: paymentId }
          })
        })
      );
    });

    test('should return false for non-existent payment', async () => {
      const paymentId = 'non-existent';

      mockDynamoDoc.send.mockResolvedValue({ Item: undefined });

      const result = await PaymentDB.deletePayment(paymentId);

      expect(result).toBe(false);
    });
  });

  describe('getPayments', () => {
    test('should retrieve payments with filters', async () => {
      const filters = {
        userId: 'test-user',
        page: 1,
        limit: 10,
        status: 'completed'
      };

      const mockPayments = [
        { id: 'payment-1', userId: 'test-user', amount: 100 },
        { id: 'payment-2', userId: 'test-user', amount: 200 }
      ];

      mockDynamoDoc.send
        .mockResolvedValueOnce({
          Items: mockPayments
        }) // QueryCommand
        .mockResolvedValueOnce({
          Responses: {
            'conectados-payments': mockPayments
          }
        }); // BatchGetCommand

      const result = await PaymentDB.getPayments(filters);

      expect(result).toEqual({
        payments: mockPayments,
        total: 2
      });

      expect(mockDynamoDoc.send).toHaveBeenCalledTimes(2);
    });

    test('should handle empty results', async () => {
      const filters = {
        userId: 'test-user',
        page: 1,
        limit: 10
      };

      mockDynamoDoc.send.mockResolvedValue({ Items: [] });

      const result = await PaymentDB.getPayments(filters);

      expect(result).toEqual({
        payments: [],
        total: 0
      });

      expect(mockDynamoDoc.send).toHaveBeenCalledTimes(1); // Only QueryCommand, no BatchGet
    });
  });

  describe('getPaymentMethods', () => {
    test('should return available payment methods', () => {
      const methods = PaymentDB.getPaymentMethods();

      expect(methods).toBeInstanceOf(Array);
      expect(methods.length).toBeGreaterThan(0);
      expect(methods[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        enabled: expect.any(Boolean)
      });
    });
  });
});

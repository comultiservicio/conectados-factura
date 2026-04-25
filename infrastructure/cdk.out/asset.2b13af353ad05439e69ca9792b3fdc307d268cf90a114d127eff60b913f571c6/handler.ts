import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secretsmanager';
// import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

import { Payment, ApiResponse, PaginatedResponse, DecodedToken } from '../../shared/types';
import { logError, logInfo, logMetric } from '../../shared/logger';
import { CacheManager } from '../../shared/cache';
import { RetryHelper } from '../../shared/retry';
import { Metrics } from '../../shared/metrics';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
// const secretsClient = new SecretsManagerClient({});
// const cognitoClient = new CognitoIdentityProviderClient({});

const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || 'conectados-payments';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';

// Esquemas de validación
const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'mercadopago', 'stripe']),
  paymentDate: z.string().datetime().optional(),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

const paymentUpdateSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
  paymentDate: z.string().datetime().optional(),
  transactionId: z.string().optional(),
  notes: z.string().optional(),
});

class PaymentService {
  private async validateUser(token: string, requiredRole?: string): Promise<DecodedToken> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
      
      if (requiredRole && decoded.role !== requiredRole) {
        throw new Error(`Insufficient permissions. Required: ${requiredRole}, Current: ${decoded.role}`);
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // private async getDatabaseCredentials() {
  //   const secretName = process.env.DB_SECRET_ARN;
  //   if (!secretName) {
  //     throw new Error('Database secret ARN not configured');
  //   }

  //   const command = new GetSecretValueCommand({ SecretId: secretName });
  //   const response = await secretsClient.send(command);
    
  //   return JSON.parse(response.SecretString || '{}');
  // }

  private async processMercadoPagoPayment(payment: Payment): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Get Mercado Pago credentials from environment or secrets
      const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      
      if (!mercadoPagoAccessToken) {
        throw new Error('Mercado Pago access token not configured');
      }

      // Create payment preference
      const preferenceData = {
        items: [{
          title: `Factura ${payment.invoiceId}`,
          quantity: 1,
          unit_price: payment.amount,
          currency_id: payment.currency === 'ARS' ? 'ARS' : 'USD',
        }],
        back_urls: {
          success: `https://app.conectadosfactura.com/payment/success`,
          failure: `https://app.conectadosfactura.com/payment/failure`,
          pending: `https://app.conectadosfactura.com/payment/pending`,
        },
        auto_return: 'approved',
        external_reference: payment.id,
      };

      const response = await axios.post(
        'https://api.mercadopago.com/checkout/preferences',
        preferenceData,
        {
          headers: {
            'Authorization': `Bearer ${mercadoPagoAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        transactionId: (response.data as any).id,
      };

    } catch (error) {
      console.error('Mercado Pago payment error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Mercado Pago payment failed',
      };
    }
  }

  private async processStripePayment(payment: Payment): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Get Stripe credentials from environment or secrets
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      
      if (!stripeSecretKey) {
        throw new Error('Stripe secret key not configured');
      }

      // Create payment intent
      const paymentIntentData = {
        amount: Math.round(payment.amount * 100), // Stripe uses cents
        currency: payment.currency.toLowerCase(),
        metadata: {
          invoiceId: payment.invoiceId,
          paymentId: payment.id,
        },
      };

      const response = await axios.post(
        'https://api.stripe.com/v1/payment_intents',
        paymentIntentData,
        {
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        success: true,
        transactionId: (response.data as any).id,
      };

    } catch (error) {
      console.error('Stripe payment error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stripe payment failed',
      };
    }
  }

  private async validateBankTransfer(referenceNumber: string): Promise<{ success: boolean; error?: string }> {
    try {
      // In production, integrate with banking API
      // For now, just validate format
      if (!referenceNumber || referenceNumber.length < 4) {
        return {
          success: false,
          error: 'Invalid reference number',
        };
      }

      return {
        success: true,
      };

    } catch (error) {
      console.error('Bank transfer validation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bank transfer validation failed',
      };
    }
  }

  async createPayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token, 'user'); // Solo usuarios pueden crear pagos
      const paymentData = JSON.parse(event.body || '{}');
      const validatedData = paymentSchema.parse(paymentData);

      const paymentId = uuidv4();
      const payment: Payment = {
        id: paymentId,
        invoiceId: validatedData.invoiceId,
        paymentMethod: validatedData.paymentMethod,
        amount: validatedData.amount,
        currency: validatedData.currency || 'ARS',
        exchangeRate: validatedData.exchangeRate || 1,
        referenceNumber: validatedData.referenceNumber,
        paymentDate: validatedData.paymentDate || new Date().toISOString(),
        notes: validatedData.notes,
        userId: decoded.sub, // Usar el userId del token decodificado
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Payment;

      let paymentResult: { success: boolean; transactionId?: string; error?: string } = { success: true };

      // Process payment based on method
      switch (payment.paymentMethod) {
        case 'qr_mercado_pago':
          paymentResult = await this.processMercadoPagoPayment(payment);
          break;
        
        case 'stripe':
          paymentResult = await this.processStripePayment(payment);
          break;
        
        case 'transfer':
          if (payment.referenceNumber) {
            const transferResult = await this.validateBankTransfer(payment.referenceNumber);
            if (transferResult.success) {
              payment.status = 'confirmed';
            } else {
              payment.status = 'failed';
              paymentResult = { success: false, error: transferResult.error };
            }
          }
          break;
        
        case 'cash':
        case 'posnet':
          // Cash and POS payments are confirmed by default
          payment.status = 'confirmed';
          break;
        
        default:
          paymentResult = { success: false, error: 'Unsupported payment method' };
      }

      // Update payment with external transaction ID if available
      if (paymentResult.success && paymentResult.transactionId) {
        payment.externalId = paymentResult.transactionId;
        payment.status = 'confirmed';
      } else if (!paymentResult.success) {
        payment.status = 'failed';
      }

      // Save payment
      await dynamoDoc.send(new PutCommand({
        TableName: PAYMENTS_TABLE,
        Item: payment,
      }));

      // Add to sync queue
      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_TABLE,
        Item: {
          userId,
          timestamp: new Date().toISOString(),
          entityType: 'payment',
          entityId: paymentId,
          operation: 'create',
          data: JSON.stringify(payment),
          status: 'synced',
        },
      }));

      logInfo('Payment created successfully', {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        userId: decoded.sub
      });

      await Metrics.recordSuccess('createPayment', { Role: decoded.role });
      await Metrics.recordLatency('createPayment', Date.now() - startTime);

      return this.createResponse(201, { 
        success: true, 
        data: payment 
      });

    } catch (error) {
      logError('Error creating payment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: decoded.sub,
        invoiceId: paymentData.invoiceId
      });

      await Metrics.recordError('createPayment', error instanceof Error ? error.name : 'Unknown');
      await Metrics.recordLatency('createPayment', Date.now() - startTime);

      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getPayments(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const page = parseInt(queryParams.page || '1');
      const limit = parseInt(queryParams.limit || '10');
      const invoiceId = queryParams.invoiceId;
      const status = queryParams.status;
      const paymentMethod = queryParams.paymentMethod;
      const dateFrom = queryParams.dateFrom;
      const dateTo = queryParams.dateTo;

      // Build query parameters
      let filterExpression = '';
      const expressionAttributeValues: any = {};
      const expressionAttributeNames: any = {};

      if (invoiceId) {
        filterExpression += 'invoiceId = :invoiceId';
        expressionAttributeValues[':invoiceId'] = invoiceId;
      }

      if (status) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += '#status = :status';
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = status;
      }

      if (paymentMethod) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += 'paymentMethod = :paymentMethod';
        expressionAttributeValues[':paymentMethod'] = paymentMethod;
      }

      const params: any = {
        TableName: PAYMENTS_TABLE,
        Limit: limit,
        ScanIndexForward: false, // Sort by creation date descending
      };

      if (filterExpression) {
        params.FilterExpression = filterExpression;
        params.ExpressionAttributeValues = expressionAttributeValues;
        if (Object.keys(expressionAttributeNames).length > 0) {
      });

    } catch (error) {
      console.error('Error getting payments:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async updatePayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const paymentId = event.pathParameters?.id;
      if (!paymentId) {
        return this.createResponse(400, { success: false, error: 'Payment ID required' });
      }

      const updateData: Partial<Payment> = JSON.parse(event.body || '{}');

      // Check if payment exists
      const existingPayment = await dynamoDoc.send(new GetCommand({
        TableName: PAYMENTS_TABLE,
        Key: { id: paymentId },
      }));

      if (!existingPayment.Item) {
        return this.createResponse(404, { success: false, error: 'Payment not found' });
      }

      // Validación de permisos: solo el usuario propietario puede actualizar el pago
      if (existingPayment.Item.userId !== decoded.sub) {
        logError('Access denied: user trying to update another user\'s payment', {
          userId: decoded.sub,
          paymentId: paymentId,
          paymentUserId: existingPayment.Item.userId
        });
        return this.createResponse(403, { success: false, error: 'Access denied' });
      }

      // Update payment
      let updateExpression = 'SET #status = :status, updatedAt = :updatedAt, #amount = :amount';
      const expressionAttributeValues: any = {
        ':status': updateData.status || existingPayment.Item.status,
        ':amount': updateData.amount || existingPayment.Item.amount,
        ':updatedAt': new Date().toISOString(),
      };

      const expressionAttributeNames: any = {
        '#status': 'status',
        '#amount': 'amount',
      };

      if (updateData.notes !== undefined) {
        updateExpression += ', notes = :notes';
        expressionAttributeValues[':notes'] = updateData.notes;
      }

      if (updateData.referenceNumber !== undefined) {
        updateExpression += ', referenceNumber = :referenceNumber';
        expressionAttributeValues[':referenceNumber'] = updateData.referenceNumber;
      }

      await dynamoDoc.send(new UpdateCommand({
        TableName: PAYMENTS_TABLE,
        Key: { id: paymentId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));

      // Get updated payment
      const result = await dynamoDoc.send(new GetCommand({
        TableName: PAYMENTS_TABLE,
        Key: { id: paymentId },
      }));

      return this.createResponse(200, { 
        success: true, 
        data: result.Item 
      });

    } catch (error) {
      console.error('Error updating payment:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getPayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token);
      const paymentId = event.pathParameters?.id;
      
      const payment = await dynamoDoc.send(new GetCommand({
        TableName: PAYMENTS_TABLE,
        Key: { id: paymentId },
      }));
      
      if (!payment.Item) {
        return this.createResponse(404, { success: false, error: 'Payment not found' });
      }
      
      // Validación de permisos: solo el usuario propietario puede ver el pago
      if (payment.Item.userId !== decoded.sub) {
        logError('Access denied: user trying to access another user\'s payment', {
          userId: decoded.sub,
          paymentId: paymentId,
          paymentUserId: payment.Item.userId
        });
        return this.createResponse(403, { success: false, error: 'Access denied' });
      }
      
      logInfo('Payment retrieved successfully', {
        paymentId: paymentId,
        userId: decoded.sub
      });

      await Metrics.recordSuccess('getPayment', { Role: decoded.role });
      await Metrics.recordLatency('getPayment', Date.now() - startTime);

      return this.createResponse(200, { success: true, data: payment.Item });
    } catch (error) {
      logError('Error getting payment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId: event.pathParameters?.id
      });

      await Metrics.recordError('getPayment', error instanceof Error ? error.name : 'Unknown');
      await Metrics.recordLatency('getPayment', Date.now() - startTime);

      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async deletePayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token);
      const paymentId = event.pathParameters?.id;
      
      // Verificar que el pago pertenezca al usuario
      const existingPayment = await dynamoDoc.send(new GetCommand({
        TableName: PAYMENTS_TABLE,
        Key: { id: paymentId },
      }));
      
      if (!existingPayment.Item || existingPayment.Item.userId !== decoded.sub) {
        logError('Access denied: user trying to delete another user\'s payment', {
          userId: decoded.sub,
          paymentId: paymentId,
          paymentUserId: existingPayment.Item?.userId
        });
        return this.createResponse(403, { success: false, error: 'Access denied' });
      }
      
      // Eliminar el pago
      await dynamoDoc.send(new DeleteCommand({
        TableName: PAYMENTS_TABLE,
        Key: { id: paymentId },
      }));
      
      logInfo('Payment deleted successfully', {
        paymentId: paymentId,
        userId: decoded.sub
      });

      await Metrics.recordSuccess('deletePayment', { Role: decoded.role });
      await Metrics.recordLatency('deletePayment', Date.now() - startTime);

      return this.createResponse(200, { success: true, data: { message: 'Payment deleted' } });
    } catch (error) {
      logError('Error deleting payment', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: decoded.sub,
        paymentId: event.pathParameters?.id
      });

      await Metrics.recordError('deletePayment', error instanceof Error ? error.name : 'Unknown');
      await Metrics.recordLatency('deletePayment', Date.now() - startTime);

      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getPaymentMethods(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const paymentMethods = [
        {
          id: 'cash',
          name: 'Efectivo',
          description: 'Pago en efectivo',
          enabled: true,
        },
        {
          id: 'transfer',
          name: 'Transferencia Bancaria',
          description: 'Transferencia desde cuenta bancaria',
          enabled: true,
        },
        {
          id: 'posnet',
          name: 'POSNET',
          description: 'Tarjeta de crédito/débito',
          enabled: true,
        },
        {
          id: 'qr_mercado_pago',
          name: 'QR Mercado Pago',
          description: 'Pago con código QR',
          enabled: process.env.MERCADO_PAGO_ACCESS_TOKEN ? true : false,
        },
        {
          id: 'stripe',
          name: 'Stripe',
          description: 'Pago internacional con tarjeta',
          enabled: process.env.STRIPE_SECRET_KEY ? true : false,
        },
      ];

      return this.createResponse(200, { 
        success: true, 
        data: paymentMethods 
      });

    } catch (error) {
      console.error('Error getting payment methods:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async webhookMercadoPago(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const webhookData = JSON.parse(event.body || '{}');
      
      // Verify webhook signature (in production)
      // const signature = event.headers['x-signature'];
      // const isValidSignature = this.verifyMercadoPagoSignature(webhookData, signature);
      
      if (webhookData.type === 'payment') {
        const paymentData = webhookData.data;
        
        if (paymentData.status === 'approved') {
          // Find payment by external reference
          const paymentResult = await dynamoDoc.send(new QueryCommand({
            TableName: PAYMENTS_TABLE,
            IndexName: 'ByExternalId',
            KeyConditionExpression: 'externalId = :externalId',
            ExpressionAttributeValues: {
              ':externalId': paymentData.external_reference,
            },
          }));

          if (paymentResult.Items && paymentResult.Items.length > 0) {
            const payment = paymentResult.Items[0];
            
            // Update payment status
            await dynamoDoc.send(new UpdateCommand({
              TableName: PAYMENTS_TABLE,
              Key: { id: payment.id },
              UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#status': 'status',
              },
              ExpressionAttributeValues: {
                ':status': 'confirmed',
                ':updatedAt': new Date().toISOString(),
              },
            }));
          }
        }
      }

      return this.createResponse(200, { 
        success: true, 
        message: 'Webhook processed' 
      });

    } catch (error) {
      console.error('Error processing Mercado Pago webhook:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  public createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    };
  }
}

const paymentService = new PaymentService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  try {
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/payments')) {
          return await paymentService.createPayment(event);
        } else if (path.includes('/webhooks/mercadopago')) {
          return await paymentService.webhookMercadoPago(event);
        }
        break;
      case 'GET':
        if (path.includes('/payments') && event.pathParameters?.id) {
          // Get single payment (similar to updatePayment but without update)
          return paymentService.createResponse(501, { 
            success: false, 
            error: 'Get single payment not implemented' 
          });
        } else if (path.includes('/payments')) {
          return await paymentService.getPayments(event);
        } else if (path.includes('/payment-methods')) {
          return await paymentService.getPaymentMethods(event);
        }
        break;
      case 'PUT':
        if (path.includes('/payments') && event.pathParameters?.id) {
          return await paymentService.updatePayment(event);
        }
        break;
      default:
        return paymentService.createResponse(405, { 
          success: false, 
          error: 'Method not allowed' 
        });
    }

    return paymentService.createResponse(404, { 
      success: false, 
      error: 'Endpoint not found' 
    });

  } catch (error) {
    console.error('Unhandled error:', error);
    return paymentService.createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { DecodedToken } from '../../shared/types';
import { logError, logInfo, logMetric } from '../../shared/logger';
import { Metrics } from '../../shared/metrics';
import { PaymentDB, CreatePaymentRequest, UpdatePaymentRequest } from './db';

// Interfaces de validación
export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod: string;
  status?: string;
  notes?: string;
  referenceNumber?: string;
  externalId?: string;
}

export interface UpdatePaymentInput {
  amount?: number;
  status?: string;
  notes?: string;
  referenceNumber?: string;
}

export interface PaymentFilters {
  page?: number;
  limit?: number;
  invoiceId?: string;
  status?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Esquemas de validación
const createPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['cash', 'transfer', 'posnet', 'qr_mercado_pago', 'stripe']),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  referenceNumber: z.string().max(100, 'Reference number too long').optional(),
  externalId: z.string().max(100, 'External ID too long').optional()
});

const updatePaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  referenceNumber: z.string().max(100, 'Reference number too long').optional()
});

const filtersSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  invoiceId: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'posnet', 'qr_mercado_pago', 'stripe']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional()
});

// Utilidades
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function sanitizeInput(input: any): any {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      // Sanitizar strings para prevenir XSS
      sanitized[key] = value
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

async function validateUser(token: string, requiredRole?: string): Promise<DecodedToken> {
  try {
    if (!token) {
      throw new Error('Authentication token is required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
    
    if (requiredRole && decoded.role !== requiredRole) {
      logError('Insufficient permissions for user', {
        userId: decoded.sub,
        userRole: decoded.role,
        requiredRole
      });
      throw new Error(`Insufficient permissions. Required: ${requiredRole}, Current: ${decoded.role}`);
    }

    logInfo('User validated successfully', {
      userId: decoded.sub,
      role: decoded.role
    });

    await Metrics.recordAuthAttempt(true, decoded.role, { Method: 'jwt' });
    return decoded;
  } catch (error) {
    logError('Authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      tokenProvided: !!token
    });

    await Metrics.recordAuthAttempt(false, 'unknown', { Method: 'jwt' });
    throw error;
  }
}

// Handlers exportados
export async function createPayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  
  try {
    // Validar token
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    if (!token) {
      return createResponse(401, { success: false, error: 'Authentication required' });
    }

    const decoded = await validateUser(token, 'user');

    // Validar y sanitizar entrada
    if (!event.body) {
      return createResponse(400, { success: false, error: 'Request body is required' });
    }

    const rawInput = JSON.parse(event.body);
    const sanitizedInput = sanitizeInput(rawInput);
    
    const validationResult = createPaymentSchema.safeParse(sanitizedInput);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      return createResponse(400, { 
        success: false, 
        error: 'Validation failed', 
        details: errors 
      });
    }

    const paymentData = {
      ...validationResult.data,
      userId: decoded.sub,
      status: validationResult.data.status || 'pending'
    };

    // Crear pago
    const payment = await PaymentDB.createPayment(paymentData);

    logInfo('Payment created successfully', {
      paymentId: payment.id,
      userId: decoded.sub,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod
    });

    await Metrics.recordSuccess('createPayment', { Role: decoded.role });
    await Metrics.recordLatency('createPayment', Date.now() - startTime);

    return createResponse(201, { 
      success: true, 
      data: payment 
    });

  } catch (error) {
    logError('Error creating payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: event.headers?.Authorization ? 'authenticated' : 'anonymous'
    });

    await Metrics.recordError('createPayment', error instanceof Error ? error.name : 'Unknown');
    await Metrics.recordLatency('createPayment', Date.now() - startTime);

    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export async function getPayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  
  try {
    // Validar token
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    if (!token) {
      return createResponse(401, { success: false, error: 'Authentication required' });
    }

    const decoded = await validateUser(token);

    // Validar parámetro ID
    const paymentId = event.pathParameters?.id;
    if (!paymentId) {
      return createResponse(400, { success: false, error: 'Payment ID is required' });
    }

    // Sanitizar ID
    const sanitizedId = sanitizeInput({ id: paymentId }).id;

    // Obtener pago
    const payment = await PaymentDB.getPayment(sanitizedId);
    
    if (!payment) {
      return createResponse(404, { success: false, error: 'Payment not found' });
    }

    // Validar permisos: solo el usuario propietario puede ver el pago
    if (payment.userId !== decoded.sub) {
      logError('Access denied: user trying to access another user\'s payment', {
        userId: decoded.sub,
        paymentId: sanitizedId,
        paymentUserId: payment.userId
      });
      return createResponse(403, { success: false, error: 'Access denied' });
    }
    
    logInfo('Payment retrieved successfully', {
      paymentId: sanitizedId,
      userId: decoded.sub
    });

    await Metrics.recordSuccess('getPayment', { Role: decoded.role });
    await Metrics.recordLatency('getPayment', Date.now() - startTime);

    return createResponse(200, { success: true, data: payment });
  } catch (error) {
    logError('Error getting payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: event.pathParameters?.id
    });

    await Metrics.recordError('getPayment', error instanceof Error ? error.name : 'Unknown');
    await Metrics.recordLatency('getPayment', Date.now() - startTime);

    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export async function updatePayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  
  try {
    // Validar token
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    if (!token) {
      return createResponse(401, { success: false, error: 'Authentication required' });
    }

    const decoded = await validateUser(token);

    // Validar parámetros
    const paymentId = event.pathParameters?.id;
    if (!paymentId) {
      return createResponse(400, { success: false, error: 'Payment ID is required' });
    }

    if (!event.body) {
      return createResponse(400, { success: false, error: 'Request body is required' });
    }

    // Sanitizar entradas
    const sanitizedId = sanitizeInput({ id: paymentId }).id;
    const rawInput = JSON.parse(event.body);
    const sanitizedInput = sanitizeInput(rawInput);
    
    const validationResult = updatePaymentSchema.safeParse(sanitizedInput);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      return createResponse(400, { 
        success: false, 
        error: 'Validation failed', 
        details: errors 
      });
    }

    // Verificar que el pago pertenezca al usuario
    const existingPayment = await PaymentDB.getPayment(sanitizedId);
    
    if (!existingPayment) {
      return createResponse(404, { success: false, error: 'Payment not found' });
    }

    if (existingPayment.userId !== decoded.sub) {
      logError('Access denied: user trying to update another user\'s payment', {
        userId: decoded.sub,
        paymentId: sanitizedId,
        paymentUserId: existingPayment.userId
      });
      return createResponse(403, { success: false, error: 'Access denied' });
    }

    // Actualizar pago
    const updateData: UpdatePaymentRequest = validationResult.data;
    const updatedPayment = await PaymentDB.updatePayment(sanitizedId, updateData);

    logInfo('Payment updated successfully', {
      paymentId: sanitizedId,
      userId: decoded.sub,
      updatedFields: Object.keys(updateData)
    });

    await Metrics.recordSuccess('updatePayment', { Role: decoded.role });
    await Metrics.recordLatency('updatePayment', Date.now() - startTime);

    return createResponse(200, { success: true, data: updatedPayment });
  } catch (error) {
    logError('Error updating payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: event.pathParameters?.id
    });

    await Metrics.recordError('updatePayment', error instanceof Error ? error.name : 'Unknown');
    await Metrics.recordLatency('updatePayment', Date.now() - startTime);

    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export async function deletePayment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  
  try {
    // Validar token
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    if (!token) {
      return createResponse(401, { success: false, error: 'Authentication required' });
    }

    const decoded = await validateUser(token);

    // Validar parámetro ID
    const paymentId = event.pathParameters?.id;
    if (!paymentId) {
      return createResponse(400, { success: false, error: 'Payment ID is required' });
    }

    // Sanitizar ID
    const sanitizedId = sanitizeInput({ id: paymentId }).id;

    // Verificar que el pago pertenezca al usuario
    const existingPayment = await PaymentDB.getPayment(sanitizedId);
    
    if (!existingPayment || existingPayment.userId !== decoded.sub) {
      logError('Access denied: user trying to delete another user\'s payment', {
        userId: decoded.sub,
        paymentId: sanitizedId,
        paymentUserId: existingPayment?.userId
      });
      return createResponse(403, { success: false, error: 'Access denied' });
    }

    // Eliminar pago
    const deleted = await PaymentDB.deletePayment(sanitizedId);
    
    if (!deleted) {
      return createResponse(404, { success: false, error: 'Payment not found' });
    }
    
    logInfo('Payment deleted successfully', {
      paymentId: sanitizedId,
      userId: decoded.sub
    });

    await Metrics.recordSuccess('deletePayment', { Role: decoded.role });
    await Metrics.recordLatency('deletePayment', Date.now() - startTime);

    return createResponse(200, { success: true, data: { message: 'Payment deleted' } });
  } catch (error) {
    logError('Error deleting payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: 'authenticated',
      paymentId: event.pathParameters?.id
    });

    await Metrics.recordError('deletePayment', error instanceof Error ? error.name : 'Unknown');
    await Metrics.recordLatency('deletePayment', Date.now() - startTime);

    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export async function getPayments(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  
  try {
    // Validar token
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    if (!token) {
      return createResponse(401, { success: false, error: 'Authentication required' });
    }

    const decoded = await validateUser(token);

    // Validar y sanitizar query parameters
    const queryParams = event.queryStringParameters || {};
    const sanitizedParams = sanitizeInput(queryParams);
    
    const validationResult = filtersSchema.safeParse(sanitizedParams);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      return createResponse(400, { 
        success: false, 
        error: 'Validation failed', 
        details: errors 
      });
    }

    const filters = {
      userId: decoded.sub,
      ...validationResult.data
    };

    // Obtener pagos
    const result = await PaymentDB.getPayments(filters);

    logInfo('Payments retrieved successfully', {
      userId: decoded.sub,
      count: result.payments.length,
      filters: validationResult.data
    });

    await Metrics.recordSuccess('getPayments', { Role: decoded.role });
    await Metrics.recordLatency('getPayments', Date.now() - startTime);

    return createResponse(200, { 
      success: true, 
      data: result.payments,
      pagination: {
        page: filters.page || 1,
        limit: filters.limit || 10,
        total: result.total
      }
    });

  } catch (error) {
    logError('Error getting payments', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: 'authenticated'
    });

    await Metrics.recordError('getPayments', error instanceof Error ? error.name : 'Unknown');
    await Metrics.recordLatency('getPayments', Date.now() - startTime);

    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export async function getPaymentMethods(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  
  try {
    // Validar token
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    if (!token) {
      return createResponse(401, { success: false, error: 'Authentication required' });
    }

    const decoded = await validateUser(token);

    // Obtener métodos de pago
    const paymentMethods = PaymentDB.getPaymentMethods();

    logInfo('Payment methods retrieved successfully', {
      userId: decoded.sub,
      count: paymentMethods.length
    });

    await Metrics.recordSuccess('getPaymentMethods', { Role: decoded.role });
    await Metrics.recordLatency('getPaymentMethods', Date.now() - startTime);

    return createResponse(200, { 
      success: true, 
      data: paymentMethods 
    });

  } catch (error) {
    logError('Error getting payment methods', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: 'authenticated'
    });

    await Metrics.recordError('getPaymentMethods', error instanceof Error ? error.name : 'Unknown');
    await Metrics.recordLatency('getPaymentMethods', Date.now() - startTime);

    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Payment } from '../shared/types';

// Configuración de DynamoDB
const client = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(client);

// Nombres de tablas desde variables de entorno
const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || 'conectados-payments';

// Interfaces
export interface CreatePaymentRequest {
  invoiceId: string;
  amount: number;
  paymentMethod: string;
  status: string;
  notes?: string;
  referenceNumber?: string;
  externalId?: string;
}

export interface UpdatePaymentRequest {
  amount?: number;
  status?: string;
  notes?: string;
  referenceNumber?: string;
}

// Funciones de base de datos
export class PaymentDB {
  /**
   * Crear un nuevo pago
   */
  static async createPayment(paymentData: CreatePaymentRequest & { userId: string }): Promise<Payment> {
    const payment: Payment = {
      id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...paymentData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamoDoc.send(new PutCommand({
      TableName: PAYMENTS_TABLE,
      Item: payment
    }));

    return payment;
  }

  /**
   * Obtener un pago por ID
   */
  static async getPayment(paymentId: string): Promise<Payment | null> {
    const result = await dynamoDoc.send(new GetCommand({
      TableName: PAYMENTS_TABLE,
      Key: { id: paymentId }
    }));

    return result.Item as Payment || null;
  }

  /**
   * Actualizar un pago
   */
  static async updatePayment(paymentId: string, updateData: UpdatePaymentRequest): Promise<Payment | null> {
    // Primero obtener el pago actual
    const existingPayment = await this.getPayment(paymentId);
    if (!existingPayment) {
      return null;
    }

    // Construir expresión de actualización
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues: any = {
      ':updatedAt': new Date().toISOString()
    };

    if (updateData.amount !== undefined) {
      updateExpression += ', #amount = :amount';
      expressionAttributeValues[':amount'] = updateData.amount;
    }

    if (updateData.status !== undefined) {
      updateExpression += ', #status = :status';
      expressionAttributeValues[':status'] = updateData.status;
    }

    if (updateData.notes !== undefined) {
      updateExpression += ', notes = :notes';
      expressionAttributeValues[':notes'] = updateData.notes;
    }

    if (updateData.referenceNumber !== undefined) {
      updateExpression += ', referenceNumber = :referenceNumber';
      expressionAttributeValues[':referenceNumber'] = updateData.referenceNumber;
    }

    const expressionAttributeNames: any = {};
    if (updateData.amount !== undefined) {
      expressionAttributeNames['#amount'] = 'amount';
    }
    if (updateData.status !== undefined) {
      expressionAttributeNames['#status'] = 'status';
    }

    await dynamoDoc.send(new UpdateCommand({
      TableName: PAYMENTS_TABLE,
      Key: { id: paymentId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    // Retornar el pago actualizado
    return await this.getPayment(paymentId);
  }

  /**
   * Eliminar un pago
   */
  static async deletePayment(paymentId: string): Promise<boolean> {
    const existingPayment = await this.getPayment(paymentId);
    if (!existingPayment) {
      return false;
    }

    await dynamoDoc.send(new DeleteCommand({
      TableName: PAYMENTS_TABLE,
      Key: { id: paymentId }
    }));

    return true;
  }

  /**
   * Obtener pagos de un usuario con filtros
   */
  static async getPayments(filters: {
    userId: string;
    page?: number;
    limit?: number;
    invoiceId?: string;
    status?: string;
    paymentMethod?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ payments: Payment[]; total: number }> {
    const { userId, page = 1, limit = 10, ...filterParams } = filters;
    
    // Construir filtros
    let filterExpression = 'userId = :userId';
    const expressionAttributeValues: any = {
      ':userId': userId
    };
    const expressionAttributeNames: any = {};

    if (filterParams.invoiceId) {
      filterExpression += ' AND invoiceId = :invoiceId';
      expressionAttributeValues[':invoiceId'] = filterParams.invoiceId;
    }

    if (filterParams.status) {
      filterExpression += ' AND #status = :status';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = filterParams.status;
    }

    if (filterParams.paymentMethod) {
      filterExpression += ' AND paymentMethod = :paymentMethod';
      expressionAttributeValues[':paymentMethod'] = filterParams.paymentMethod;
    }

    const params: any = {
      TableName: PAYMENTS_TABLE,
      Limit: limit,
      ScanIndexForward: false, // Ordenar por fecha descendente
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await dynamoDoc.send(new QueryCommand(params));

    // Optimización: usar BatchGet para obtener detalles completos
    const paymentIds = result.Items?.map((p: any) => p.id) || [];
    let payments = result.Items as Payment[] || [];

    if (paymentIds.length > 0) {
      const batchResult = await dynamoDoc.send(new BatchGetCommand({
        RequestItems: {
          [PAYMENTS_TABLE]: { Keys: paymentIds.map((id: string) => ({ id })) }
        }
      }));
      
      payments = batchResult.Responses?.[PAYMENTS_TABLE] as Payment[] || [];
    }

    return {
      payments,
      total: result.Items?.length || 0
    };
  }

  /**
   * Obtener métodos de pago disponibles
   */
  static getPaymentMethods() {
    return [
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
  }
}

export { dynamoDoc };

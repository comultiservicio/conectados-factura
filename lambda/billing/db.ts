import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Invoice } from '../shared/types';

// Configuración de DynamoDB
const client = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(client);

// Nombres de tablas desde variables de entorno
const INVOICES_TABLE = process.env.INVOICES_TABLE || 'conectados-invoices';

// Interfaces
export interface CreateInvoiceRequest {
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  taxAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  items: Array<{
    productId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  notes?: string;
}

export interface UpdateInvoiceRequest {
  status?: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
  dueDate?: string;
}

// Funciones de base de datos
export class InvoiceDB {
  /**
   * Crear una nueva factura
   */
  static async createInvoice(invoiceData: CreateInvoiceRequest & { userId: string }): Promise<Invoice> {
    const invoice: Invoice = {
      id: `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...invoiceData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamoDoc.send(new PutCommand({
      TableName: INVOICES_TABLE,
      Item: invoice
    }));

    return invoice;
  }

  /**
   * Obtener una factura por ID
   */
  static async getInvoice(invoiceId: string): Promise<Invoice | null> {
    const result = await dynamoDoc.send(new GetCommand({
      TableName: INVOICES_TABLE,
      Key: { id: invoiceId }
    }));

    return result.Item as Invoice || null;
  }

  /**
   * Actualizar una factura
   */
  static async updateInvoice(invoiceId: string, updateData: UpdateInvoiceRequest): Promise<Invoice | null> {
    // Primero obtener la factura actual
    const existingInvoice = await this.getInvoice(invoiceId);
    if (!existingInvoice) {
      return null;
    }

    // Construir expresión de actualización
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues: any = {
      ':updatedAt': new Date().toISOString()
    };

    if (updateData.status !== undefined) {
      updateExpression += ', #status = :status';
      expressionAttributeValues[':status'] = updateData.status;
    }

    if (updateData.notes !== undefined) {
      updateExpression += ', notes = :notes';
      expressionAttributeValues[':notes'] = updateData.notes;
    }

    if (updateData.dueDate !== undefined) {
      updateExpression += ', dueDate = :dueDate';
      expressionAttributeValues[':dueDate'] = updateData.dueDate;
    }

    const expressionAttributeNames: any = {};
    if (updateData.status !== undefined) {
      expressionAttributeNames['#status'] = 'status';
    }

    await dynamoDoc.send(new UpdateCommand({
      TableName: INVOICES_TABLE,
      Key: { id: invoiceId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    // Retornar la factura actualizada
    return await this.getInvoice(invoiceId);
  }

  /**
   * Eliminar una factura
   */
  static async deleteInvoice(invoiceId: string): Promise<boolean> {
    const existingInvoice = await this.getInvoice(invoiceId);
    if (!existingInvoice) {
      return false;
    }

    await dynamoDoc.send(new DeleteCommand({
      TableName: INVOICES_TABLE,
      Key: { id: invoiceId }
    }));

    return true;
  }

  /**
   * Obtener facturas de un usuario con filtros
   */
  static async getInvoices(filters: {
    userId: string;
    page?: number;
    limit?: number;
    customerId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ invoices: Invoice[]; total: number }> {
    const { userId, page = 1, limit = 10, ...filterParams } = filters;
    
    // Construir filtros
    let filterExpression = 'userId = :userId';
    const expressionAttributeValues: any = {
      ':userId': userId
    };
    const expressionAttributeNames: any = {};

    if (filterParams.customerId) {
      filterExpression += ' AND customerId = :customerId';
      expressionAttributeValues[':customerId'] = filterParams.customerId;
    }

    if (filterParams.status) {
      filterExpression += ' AND #status = :status';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = filterParams.status;
    }

    const params: any = {
      TableName: INVOICES_TABLE,
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
    const invoiceIds = result.Items?.map((inv: any) => inv.id) || [];
    let invoices = result.Items as Invoice[] || [];

    if (invoiceIds.length > 0) {
      const batchResult = await dynamoDoc.send(new BatchGetCommand({
        RequestItems: {
          [INVOICES_TABLE]: { Keys: invoiceIds.map((id: string) => ({ id })) }
        }
      }));
      
      invoices = batchResult.Responses?.[INVOICES_TABLE] as Invoice[] || [];
    }

    return {
      invoices,
      total: result.Items?.length || 0
    };
  }

  /**
   * Obtener estadísticas de facturación
   */
  static async getBillingStats(userId: string): Promise<{
    totalInvoices: number;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    overdueAmount: number;
  }> {
    const result = await dynamoDoc.send(new QueryCommand({
      TableName: INVOICES_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));

    const invoices = result.Items as Invoice[] || [];
    
    const stats = invoices.reduce((acc, invoice) => {
      acc.totalInvoices++;
      acc.totalAmount += invoice.totalAmount;
      
      switch (invoice.status) {
        case 'paid':
          acc.paidAmount += invoice.totalAmount;
          break;
        case 'sent':
          acc.pendingAmount += invoice.totalAmount;
          break;
        case 'overdue':
          acc.overdueAmount += invoice.totalAmount;
          break;
      }
      
      return acc;
    }, {
      totalInvoices: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      overdueAmount: 0
    });

    return stats;
  }
}

export { dynamoDoc };

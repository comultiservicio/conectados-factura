import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

import { Invoice, InvoiceItem, ApiResponse, PaginatedResponse, DecodedToken } from '../../shared/types';
import { logError, logInfo, logMetric } from '../../shared/logger';
import { CacheManager } from '../../shared/cache';
import { RetryHelper } from '../../shared/retry';
import { Metrics } from '../../shared/metrics';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const secretsClient = new SecretsManagerClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

const INVOICES_TABLE = process.env.INVOICES_TABLE || 'conectados-invoices';
const INVOICE_ITEMS_TABLE = process.env.INVOICE_ITEMS_TABLE || 'conectados-invoice-items';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';
const INVOICES_BUCKET = process.env.INVOICES_BUCKET_NAME || 'conectados-factura-invoices';

// Esquemas de validación
const invoiceSchema = z.object({
  companyId: z.string().optional(),
  customerId: z.string().min(1),
  invoiceType: z.enum(['A', 'B', 'C', 'E', 'M', 'P', 'T']),
  invoiceNumber: z.string().min(1),
  issueDate: z.string(),
  dueDate: z.string().optional(),
  documentType: z.string().optional(),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    taxRate: z.number().min(0).max(100),
    discount: z.number().min(0).optional(),
  })).min(1),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
});

interface AFIPResponse {
  success: boolean;
  cae?: string;
  caeDueDate?: string;
  error?: string;
}

class BillingService {
  private async getDatabaseCredentials() {
    const secretName = process.env.DB_SECRET_ARN;
    if (!secretName) {
      throw new Error('Database secret ARN not configured');
    }

    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    
    return JSON.parse(response.SecretString || '{}');
  }

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

  private async generateAFIPCAE(invoice: Invoice): Promise<AFIPResponse> {
    try {
      // AFIP WSFE integration
      // This is a simplified version - in production, you'd use the actual AFIP web service
      const afipService = new AFIPService();
      
      const result = await afipService.requestCAE({
        tipoComprobante: invoice.invoiceType === 'A' ? 1 : invoice.invoiceType === 'B' ? 6 : 11,
        puntoVenta: 1,
        numeroComprobante: parseInt(invoice.invoiceNumber.split('-')[1] || '1'),
        fecha: invoice.issueDate,
        importeTotal: invoice.totalAmount,
        importeNeto: invoice.netAmount,
        importeIVA: invoice.ivaAmount,
        importeTributos: invoice.otherTaxes,
        monedaId: invoice.currency === 'ARS' ? 'PES' : 'DOL',
        monedaCotiz: invoice.exchangeRate,
        tipoDoc: 80, // CUIT
        numeroDoc: invoice.customer?.taxId?.replace(/-/g, '') || '',
        tipoIva: invoice.items?.map(item => ({
          id: item.ivaRate === 21 ? 5 : item.ivaRate === 10.5 ? 4 : 3,
          baseImp: item.totalLine / (1 + item.ivaRate / 100),
          importe: item.totalLine * (item.ivaRate / 100),
        })) || [],
      });

      if (result.success && result.cae) {
        return {
          success: true,
          cae: result.cae,
          caeDueDate: result.caeVencimiento,
        };
      }

      return {
        success: false,
        error: result.error || 'AFIP request failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown AFIP error',
      };
    }
  }

  private async generateInvoicePDF(invoice: Invoice): Promise<string> {
    const pdfContent = await this.createPDFContent(invoice);
    const fileName = `invoices/${invoice.id}.pdf`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: INVOICES_BUCKET,
      Key: fileName,
      Body: pdfContent,
      ContentType: 'application/pdf',
    }));

    return `https://${INVOICES_BUCKET}.s3.amazonaws.com/${fileName}`;
  }

  private async createPDFContent(invoice: Invoice): Promise<Buffer> {
    // PDF generation logic
    // In production, use a library like pdfkit or puppeteer
    const pdfContent = `
      Factura Electrónica ${invoice.invoiceType}
      Número: ${invoice.invoiceNumber}
      CAE: ${invoice.cae || 'Pendiente'}
      
      Cliente: ${invoice.customer?.name || 'N/A'}
      CUIT: ${invoice.customer?.taxId || 'N/A'}
      
      Fecha: ${invoice.issueDate}
      
      Items:
      ${invoice.items?.map(item => 
        `${item.quantity} x ${item.product?.name || 'N/A'} - $${item.totalLine.toFixed(2)}`
      ).join('\n') || ''}
      
      Subtotal: $${invoice.netAmount.toFixed(2)}
      IVA: $${invoice.ivaAmount.toFixed(2)}
      Total: $${invoice.totalAmount.toFixed(2)}
    `;

    return Buffer.from(pdfContent);
  }

  async createInvoice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token, 'user'); // Solo usuarios pueden crear facturas
      const invoiceData = JSON.parse(event.body || '{}');
      const validatedData = invoiceSchema.parse(invoiceData);

      const invoiceId = uuidv4();
      const invoiceNumber = await this.generateInvoiceNumber(validatedData.invoiceType || 'B');

      const invoice: Invoice = {
        id: invoiceId,
        companyId: validatedData.companyId || '',
        customerId: validatedData.customerId,
        invoiceType: validatedData.invoiceType || 'B',
        invoiceNumber,
        issueDate: validatedData.issueDate || new Date().toISOString().split('T')[0],
        dueDate: validatedData.dueDate,
        documentType: validatedData.documentType,
        currency: validatedData.currency || 'ARS',
        exchangeRate: validatedData.exchangeRate || 1,
        items: validatedData.items,
        paymentMethod: validatedData.paymentMethod,
        notes: validatedData.notes,
        userId: decoded.sub, // Usar el userId del token decodificado
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Invoice;

      // Calculate totals
      invoice.items?.forEach(item => {
        const subtotal = item.quantity * item.unitPrice;
        const discount = subtotal * (item.discountRate / 100);
        const netLine = subtotal - discount;
        const ivaLine = netLine * (item.ivaRate / 100);
        item.totalLine = netLine + ivaLine;

        invoice.netAmount += netLine;
        invoice.ivaAmount += ivaLine;
        invoice.totalAmount += item.totalLine;
      });

      // Request CAE from AFIP
      const afipResponse = await this.generateAFIPCAE(invoice);
      
      if (afipResponse.success && afipResponse.cae) {
        invoice.cae = afipResponse.cae;
        invoice.caeDueDate = afipResponse.caeDueDate;
        invoice.status = 'issued';
      } else {
        invoice.status = 'draft';
        console.error('AFIP CAE request failed:', afipResponse.error);
      }

      // Save invoice to database
      await dynamoDoc.send(new PutCommand({
        TableName: INVOICES_TABLE,
        Item: invoice,
      }));

      // Save invoice items
      for (const item of invoice.items || []) {
        await dynamoDoc.send(new PutCommand({
          TableName: INVOICE_ITEMS_TABLE,
          Item: item,
        }));
      }

      // Generate PDF
      if (invoice.status === 'issued') {
        const pdfUrl = await this.generateInvoicePDF(invoice);
        // Update invoice with PDF URL
        await dynamoDoc.send(new UpdateCommand({
          TableName: INVOICES_TABLE,
          Key: { id: invoiceId },
          UpdateExpression: 'SET pdfUrl = :pdfUrl',
          ExpressionAttributeValues: { ':pdfUrl': pdfUrl },
        }));
      }

      // Add to sync queue
      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_TABLE,
        Item: {
          userId,
          timestamp: new Date().toISOString(),
          entityType: 'invoice',
          entityId: invoiceId,
          operation: 'create',
          data: JSON.stringify(invoice),
          status: 'synced',
        },
      }));

      logInfo('Invoice created successfully', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        userId: decoded.sub
      });

      await Metrics.recordSuccess('createInvoice', { Role: decoded.role });
      await Metrics.recordLatency('createInvoice', Date.now() - startTime);

      return this.createResponse(201, { 
        success: true, 
        data: invoice 
      });

    } catch (error) {
      logError('Error creating invoice', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: decoded.sub,
        customerId: invoiceData.customerId
      });

      await Metrics.recordError('createInvoice', error instanceof Error ? error.name : 'Unknown');
      await Metrics.recordLatency('createInvoice', Date.now() - startTime);

      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getInvoice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const invoiceId = event.pathParameters?.id;
      if (!invoiceId) {
        return this.createResponse(400, { success: false, error: 'Invoice ID required' });
      }

      const result = await dynamoDoc.send(new GetCommand({
        TableName: INVOICES_TABLE,
        Key: { id: invoiceId },
      }));

      if (!result.Item) {
        return this.createResponse(404, { success: false, error: 'Invoice not found' });
      }

      // Get invoice items
      const itemsResult = await dynamoDoc.send(new QueryCommand({
        TableName: INVOICE_ITEMS_TABLE,
        KeyConditionExpression: 'invoiceId = :invoiceId',
        ExpressionAttributeValues: { ':invoiceId': invoiceId },
      }));

      const invoice = result.Item as Invoice;
      invoice.items = itemsResult.Items as InvoiceItem[];

      return this.createResponse(200, { 
        success: true, 
        data: invoice 
      });

    } catch (error) {
      console.error('Error getting invoice:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async updateInvoice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const invoiceId = event.pathParameters?.id;
      if (!invoiceId) {
        return this.createResponse(400, { success: false, error: 'Invoice ID required' });
      }

      const updateData: Partial<Invoice> = JSON.parse(event.body || '{}');

      // Check if invoice exists
      const existingInvoice = await dynamoDoc.send(new GetCommand({
        TableName: INVOICES_TABLE,
        Key: { id: invoiceId },
      }));

      if (!existingInvoice.Item) {
        return this.createResponse(404, { success: false, error: 'Invoice not found' });
      }

      const invoice = existingInvoice.Item as Invoice;

      // Only allow updates to draft invoices
      if (invoice.status !== 'draft') {
        return this.createResponse(400, { 
          success: false, 
          error: 'Only draft invoices can be updated' 
        });
      }

      // Update invoice
      let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
      const expressionAttributeValues: any = {
        ':status': updateData.status || invoice.status,
        ':updatedAt': new Date().toISOString(),
      };

      const expressionAttributeNames: any = {
        '#status': 'status',
      };

      if (updateData.notes !== undefined) {
        updateExpression += ', notes = :notes';
        expressionAttributeValues[':notes'] = updateData.notes;
      }

      await dynamoDoc.send(new UpdateCommand({
        TableName: INVOICES_TABLE,
        Key: { id: invoiceId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));

      // Get updated invoice
      const result = await dynamoDoc.send(new GetCommand({
        TableName: INVOICES_TABLE,
        Key: { id: invoiceId },
      }));

      return this.createResponse(200, { 
        success: true, 
        data: result.Item 
      });

    } catch (error) {
      console.error('Error updating invoice:', error);
      return this.createResponse(500, {
        success: false,

  async deleteInvoice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const invoiceId = event.pathParameters?.id;
      if (!invoiceId) {
        return this.createResponse(400, { success: false, error: 'Invoice ID required' });
      }

      // Check if invoice exists
      const existingInvoice = await dynamoDoc.send(new GetCommand({
        TableName: INVOICES_TABLE,
        Key: { id: invoiceId },
      }));

      if (!existingInvoice.Item) {
        return this.createResponse(404, { success: false, error: 'Invoice not found' });
      }

      const invoice = existingInvoice.Item as Invoice;

      // Only allow deletion of draft invoices
      if (invoice.status !== 'draft') {
        return this.createResponse(400, { 
          success: false, 
          error: 'Only draft invoices can be deleted' 
        });
      }

      // Validación de permisos: solo el usuario propietario puede eliminar la factura
      const decoded = await this.validateUser(token);
      if (invoice.userId !== decoded.sub) {
        logError('Access denied: user trying to delete another user\'s invoice', {
          userId: decoded.sub,
          invoiceId: invoiceId,
          invoiceUserId: invoice.userId
        });
        return this.createResponse(403, { success: false, error: 'Access denied' });
      }

      // Delete invoice items
      const itemsResult = await dynamoDoc.send(new QueryCommand({
        TableName: INVOICE_ITEMS_TABLE,
        KeyConditionExpression: 'invoiceId = :invoiceId',
        ExpressionAttributeValues: { ':invoiceId': invoiceId },
      }));

      for (const item of itemsResult.Items || []) {
        await dynamoDoc.send(new DeleteCommand({
          TableName: INVOICE_ITEMS_TABLE,
          Key: { id: item.id },
        }));
      }

      // Delete invoice
      await dynamoDoc.send(new DeleteCommand({
        TableName: INVOICES_TABLE,
        Key: { id: invoiceId },
      }));

      return this.createResponse(200, { 
        success: true, 
        message: 'Invoice deleted successfully' 
      });

    } catch (error) {
      console.error('Error deleting invoice:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async listInvoices(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const page = parseInt(queryParams.page || '1');
      const limit = parseInt(queryParams.limit || '10');
      const status = queryParams.status;
      const customerId = queryParams.customerId;

      // Build query parameters
      let filterExpression = '';
      const expressionAttributeValues: any = {};
      const expressionAttributeNames: any = {};

      if (status) {
        filterExpression += '#status = :status';
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = status;
      }

      if (customerId) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += 'customerId = :customerId';
        expressionAttributeValues[':customerId'] = customerId;
      }

      const params: any = {
        TableName: INVOICES_TABLE,
        Limit: limit,
      };

      if (filterExpression) {
        params.FilterExpression = filterExpression;
        params.ExpressionAttributeValues = expressionAttributeValues;
        params.ExpressionAttributeNames = expressionAttributeNames;
      }

      const result = await dynamoDoc.send(new QueryCommand(params));

      return this.createResponse(200, {
        success: true,
        data: result.Items,
        pagination: {
          page,
          limit,
          total: result.Items?.length || 0,
        },
      });

    } catch (error) {
      console.error('Error listing invoices:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  private async generateInvoiceNumber(invoiceType: string): Promise<string> {
    // Generate sequential invoice number
    // In production, this should be atomic and handle concurrent requests
    const prefix = invoiceType === 'A' ? '0001' : invoiceType === 'B' ? '0006' : '0011';
    const sequence = Math.floor(Math.random() * 9000) + 1000; // Simplified - use proper sequence
    return `${prefix}-${sequence}`;
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

// AFIP Service (simplified)
class AFIPService {
  async requestCAE(data: any): Promise<any> {
    // This is a placeholder for AFIP WSFE integration
    // In production, use proper AFIP web service client
    return {
      success: true,
      cae: uuidv4().replace(/-/g, '').substring(0, 14),
      caeVencimiento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
  }
}

const billingService = new BillingService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  try {
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/invoices')) {
          return await billingService.createInvoice(event);
        }
        break;
      case 'GET':
        if (path.includes('/invoices') && event.pathParameters?.id) {
          return await billingService.getInvoice(event);
        } else if (path.includes('/invoices')) {
          return await billingService.listInvoices(event);
        }
        break;
      case 'PUT':
        if (path.includes('/invoices') && event.pathParameters?.id) {
          return await billingService.updateInvoice(event);
        }
        break;
      case 'DELETE':
        if (path.includes('/invoices') && event.pathParameters?.id) {
          return await billingService.deleteInvoice(event);
        }
        break;
      default:
        return billingService.createResponse(405, { 
          success: false, 
          error: 'Method not allowed' 
        });
    }

    return billingService.createResponse(404, { 
      success: false, 
      error: 'Endpoint not found' 
    });

  } catch (error) {
    console.error('Unhandled error:', error);
    return billingService.createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};

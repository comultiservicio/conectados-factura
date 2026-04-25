"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const uuid_1 = require("uuid");
const jwt = __importStar(require("jsonwebtoken"));
const zod_1 = require("zod");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new client_s3_1.S3Client({});
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const INVOICES_TABLE = process.env.INVOICES_TABLE || 'conectados-invoices';
const INVOICE_ITEMS_TABLE = process.env.INVOICE_ITEMS_TABLE || 'conectados-invoice-items';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';
const INVOICES_BUCKET = process.env.INVOICES_BUCKET_NAME || 'conectados-factura-invoices';
// Esquemas de validación
const invoiceSchema = zod_1.z.object({
    companyId: zod_1.z.string().optional(),
    customerId: zod_1.z.string().min(1),
    invoiceType: zod_1.z.enum(['A', 'B', 'C', 'E', 'M', 'P', 'T']),
    invoiceNumber: zod_1.z.string().min(1),
    issueDate: zod_1.z.string(),
    dueDate: zod_1.z.string().optional(),
    documentType: zod_1.z.string().optional(),
    currency: zod_1.z.string().optional(),
    exchangeRate: zod_1.z.number().optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        description: zod_1.z.string().min(1),
        quantity: zod_1.z.number().positive(),
        unitPrice: zod_1.z.number().positive(),
        taxRate: zod_1.z.number().min(0).max(100),
        discount: zod_1.z.number().min(0).optional(),
    })).min(1),
    paymentMethod: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    referenceNumber: zod_1.z.string().optional(),
});
class BillingService {
    async getDatabaseCredentials() {
        const secretName = process.env.DB_SECRET_ARN;
        if (!secretName) {
            throw new Error('Database secret ARN not configured');
        }
        const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName });
        const response = await secretsClient.send(command);
        return JSON.parse(response.SecretString || '{}');
    }
    async validateUser(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return decoded.sub;
        }
        catch (error) {
            throw new Error('Invalid authentication token');
        }
    }
    async generateAFIPCAE(invoice) {
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
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown AFIP error',
            };
        }
    }
    async generateInvoicePDF(invoice) {
        const pdfContent = await this.createPDFContent(invoice);
        const fileName = `invoices/${invoice.id}.pdf`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: INVOICES_BUCKET,
            Key: fileName,
            Body: pdfContent,
            ContentType: 'application/pdf',
        }));
        return `https://${INVOICES_BUCKET}.s3.amazonaws.com/${fileName}`;
    }
    async createPDFContent(invoice) {
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
      ${invoice.items?.map(item => `${item.quantity} x ${item.product?.name || 'N/A'} - $${item.totalLine.toFixed(2)}`).join('\n') || ''}
      
      Subtotal: $${invoice.netAmount.toFixed(2)}
      IVA: $${invoice.ivaAmount.toFixed(2)}
      Total: $${invoice.totalAmount.toFixed(2)}
    `;
        return Buffer.from(pdfContent);
    }
    async createInvoice(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            const invoiceData = JSON.parse(event.body || '{}');
            const validatedData = invoiceSchema.parse(invoiceData);
            const invoiceId = (0, uuid_1.v4)();
            const invoiceNumber = await this.generateInvoiceNumber(validatedData.invoiceType || 'B');
            const invoice = {
                id: invoiceId,
                companyId: validatedData.companyId || '',
                customerId: validatedData.customerId,
                invoiceNumber,
                invoiceType: validatedData.invoiceType || 'B',
                documentType: validatedData.documentType || 'factura',
                issueDate: validatedData.issueDate || new Date().toISOString().split('T')[0],
                totalAmount: 0,
                netAmount: 0,
                ivaAmount: 0,
                otherTaxes: 0,
                currency: validatedData.currency || 'ARS',
                exchangeRate: validatedData.exchangeRate || 1,
                status: 'draft',
                items: validatedData.items.map((item) => ({
                    ...item,
                    id: (0, uuid_1.v4)(),
                    invoiceId,
                })),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
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
            }
            else {
                invoice.status = 'draft';
                console.error('AFIP CAE request failed:', afipResponse.error);
            }
            // Save invoice to database
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: INVOICES_TABLE,
                Item: invoice,
            }));
            // Save invoice items
            for (const item of invoice.items || []) {
                await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                    TableName: INVOICE_ITEMS_TABLE,
                    Item: item,
                }));
            }
            // Generate PDF
            if (invoice.status === 'issued') {
                const pdfUrl = await this.generateInvoicePDF(invoice);
                // Update invoice with PDF URL
                await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: INVOICES_TABLE,
                    Key: { id: invoiceId },
                    UpdateExpression: 'SET pdfUrl = :pdfUrl',
                    ExpressionAttributeValues: { ':pdfUrl': pdfUrl },
                }));
            }
            // Add to sync queue
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
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
            return this.createResponse(201, {
                success: true,
                data: invoice
            });
        }
        catch (error) {
            console.error('Error creating invoice:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getInvoice(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const invoiceId = event.pathParameters?.id;
            if (!invoiceId) {
                return this.createResponse(400, { success: false, error: 'Invoice ID required' });
            }
            const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: INVOICES_TABLE,
                Key: { id: invoiceId },
            }));
            if (!result.Item) {
                return this.createResponse(404, { success: false, error: 'Invoice not found' });
            }
            // Get invoice items
            const itemsResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: INVOICE_ITEMS_TABLE,
                KeyConditionExpression: 'invoiceId = :invoiceId',
                ExpressionAttributeValues: { ':invoiceId': invoiceId },
            }));
            const invoice = result.Item;
            invoice.items = itemsResult.Items;
            return this.createResponse(200, {
                success: true,
                data: invoice
            });
        }
        catch (error) {
            console.error('Error getting invoice:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async updateInvoice(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const invoiceId = event.pathParameters?.id;
            if (!invoiceId) {
                return this.createResponse(400, { success: false, error: 'Invoice ID required' });
            }
            const updateData = JSON.parse(event.body || '{}');
            // Check if invoice exists
            const existingInvoice = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: INVOICES_TABLE,
                Key: { id: invoiceId },
            }));
            if (!existingInvoice.Item) {
                return this.createResponse(404, { success: false, error: 'Invoice not found' });
            }
            const invoice = existingInvoice.Item;
            // Only allow updates to draft invoices
            if (invoice.status !== 'draft') {
                return this.createResponse(400, {
                    success: false,
                    error: 'Only draft invoices can be updated'
                });
            }
            // Update invoice
            let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
            const expressionAttributeValues = {
                ':status': updateData.status || invoice.status,
                ':updatedAt': new Date().toISOString(),
            };
            const expressionAttributeNames = {
                '#status': 'status',
            };
            if (updateData.notes !== undefined) {
                updateExpression += ', notes = :notes';
                expressionAttributeValues[':notes'] = updateData.notes;
            }
            await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                TableName: INVOICES_TABLE,
                Key: { id: invoiceId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
            }));
            // Get updated invoice
            const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: INVOICES_TABLE,
                Key: { id: invoiceId },
            }));
            return this.createResponse(200, {
                success: true,
                data: result.Item
            });
        }
        catch (error) {
            console.error('Error updating invoice:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async deleteInvoice(event) {
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
            const existingInvoice = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: INVOICES_TABLE,
                Key: { id: invoiceId },
            }));
            if (!existingInvoice.Item) {
                return this.createResponse(404, { success: false, error: 'Invoice not found' });
            }
            const invoice = existingInvoice.Item;
            // Only allow deletion of draft invoices
            if (invoice.status !== 'draft') {
                return this.createResponse(400, {
                    success: false,
                    error: 'Only draft invoices can be deleted'
                });
            }
            // Delete invoice items
            const itemsResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: INVOICE_ITEMS_TABLE,
                KeyConditionExpression: 'invoiceId = :invoiceId',
                ExpressionAttributeValues: { ':invoiceId': invoiceId },
            }));
            for (const item of itemsResult.Items || []) {
                await dynamoDoc.send(new lib_dynamodb_1.DeleteCommand({
                    TableName: INVOICE_ITEMS_TABLE,
                    Key: { id: item.id },
                }));
            }
            // Delete invoice
            await dynamoDoc.send(new lib_dynamodb_1.DeleteCommand({
                TableName: INVOICES_TABLE,
                Key: { id: invoiceId },
            }));
            return this.createResponse(200, {
                success: true,
                message: 'Invoice deleted successfully'
            });
        }
        catch (error) {
            console.error('Error deleting invoice:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async listInvoices(event) {
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
            const expressionAttributeValues = {};
            const expressionAttributeNames = {};
            if (status) {
                filterExpression += '#status = :status';
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = status;
            }
            if (customerId) {
                if (filterExpression)
                    filterExpression += ' AND ';
                filterExpression += 'customerId = :customerId';
                expressionAttributeValues[':customerId'] = customerId;
            }
            const params = {
                TableName: INVOICES_TABLE,
                Limit: limit,
            };
            if (filterExpression) {
                params.FilterExpression = filterExpression;
                params.ExpressionAttributeValues = expressionAttributeValues;
                params.ExpressionAttributeNames = expressionAttributeNames;
            }
            const result = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand(params));
            return this.createResponse(200, {
                success: true,
                data: result.Items,
                pagination: {
                    page,
                    limit,
                    total: result.Items?.length || 0,
                },
            });
        }
        catch (error) {
            console.error('Error listing invoices:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async generateInvoiceNumber(invoiceType) {
        // Generate sequential invoice number
        // In production, this should be atomic and handle concurrent requests
        const prefix = invoiceType === 'A' ? '0001' : invoiceType === 'B' ? '0006' : '0011';
        const sequence = Math.floor(Math.random() * 9000) + 1000; // Simplified - use proper sequence
        return `${prefix}-${sequence}`;
    }
    createResponse(statusCode, body) {
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
    async requestCAE(data) {
        // This is a placeholder for AFIP WSFE integration
        // In production, use proper AFIP web service client
        return {
            success: true,
            cae: (0, uuid_1.v4)().replace(/-/g, '').substring(0, 14),
            caeVencimiento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        };
    }
}
const billingService = new BillingService();
const handler = async (event) => {
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
                }
                else if (path.includes('/invoices')) {
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
    }
    catch (error) {
        console.error('Unhandled error:', error);
        return billingService.createResponse(500, {
            success: false,
            error: 'Internal server error',
        });
    }
};
exports.handler = handler;

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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
// import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secretsmanager';
// import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
const jwt = __importStar(require("jsonwebtoken"));
const zod_1 = require("zod");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// const secretsClient = new SecretsManagerClient({});
// const cognitoClient = new CognitoIdentityProviderClient({});
const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || 'conectados-payments';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';
// Esquemas de validación
const paymentSchema = zod_1.z.object({
    invoiceId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    paymentMethod: zod_1.z.enum(['cash', 'card', 'transfer', 'mercadopago', 'stripe']),
    paymentDate: zod_1.z.string().datetime().optional(),
    currency: zod_1.z.string().optional(),
    exchangeRate: zod_1.z.number().optional(),
    referenceNumber: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const paymentUpdateSchema = zod_1.z.object({
    status: zod_1.z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
    paymentDate: zod_1.z.string().datetime().optional(),
    transactionId: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
class PaymentService {
    async validateUser(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return decoded.sub;
        }
        catch (error) {
            throw new Error('Invalid authentication token');
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
    async processMercadoPagoPayment(payment) {
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
            const response = await axios_1.default.post('https://api.mercadopago.com/checkout/preferences', preferenceData, {
                headers: {
                    'Authorization': `Bearer ${mercadoPagoAccessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return {
                success: true,
                transactionId: response.data.id,
            };
        }
        catch (error) {
            console.error('Mercado Pago payment error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Mercado Pago payment failed',
            };
        }
    }
    async processStripePayment(payment) {
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
            const response = await axios_1.default.post('https://api.stripe.com/v1/payment_intents', paymentIntentData, {
                headers: {
                    'Authorization': `Bearer ${stripeSecretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            return {
                success: true,
                transactionId: response.data.id,
            };
        }
        catch (error) {
            console.error('Stripe payment error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Stripe payment failed',
            };
        }
    }
    async validateBankTransfer(referenceNumber) {
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
        }
        catch (error) {
            console.error('Bank transfer validation error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Bank transfer validation failed',
            };
        }
    }
    async createPayment(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            const paymentData = JSON.parse(event.body || '{}');
            const validatedData = paymentSchema.parse(paymentData);
            const paymentId = (0, uuid_1.v4)();
            const payment = {
                id: paymentId,
                invoiceId: validatedData.invoiceId,
                paymentMethod: validatedData.paymentMethod,
                amount: validatedData.amount,
                currency: validatedData.currency || 'ARS',
                paymentDate: validatedData.paymentDate || new Date().toISOString().split('T')[0],
                referenceNumber: validatedData.referenceNumber,
                status: 'pending',
                notes: validatedData.notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            let paymentResult = { success: true };
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
                        }
                        else {
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
            }
            else if (!paymentResult.success) {
                payment.status = 'failed';
            }
            // Save payment
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: PAYMENTS_TABLE,
                Item: payment,
            }));
            // Add to sync queue
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
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
            return this.createResponse(201, {
                success: true,
                data: payment
            });
        }
        catch (error) {
            console.error('Error creating payment:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getPayments(event) {
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
            const expressionAttributeValues = {};
            const expressionAttributeNames = {};
            if (invoiceId) {
                filterExpression += 'invoiceId = :invoiceId';
                expressionAttributeValues[':invoiceId'] = invoiceId;
            }
            if (status) {
                if (filterExpression)
                    filterExpression += ' AND ';
                filterExpression += '#status = :status';
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = status;
            }
            if (paymentMethod) {
                if (filterExpression)
                    filterExpression += ' AND ';
                filterExpression += 'paymentMethod = :paymentMethod';
                expressionAttributeValues[':paymentMethod'] = paymentMethod;
            }
            const params = {
                TableName: PAYMENTS_TABLE,
                Limit: limit,
                ScanIndexForward: false, // Sort by creation date descending
            };
            if (filterExpression) {
                params.FilterExpression = filterExpression;
                params.ExpressionAttributeValues = expressionAttributeValues;
                if (Object.keys(expressionAttributeNames).length > 0) {
                    params.ExpressionAttributeNames = expressionAttributeNames;
                }
            }
            const result = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand(params));
            return this.createResponse(200, {
                success: true,
                data: result.Items || [],
                pagination: {
                    page,
                    limit,
                    total: result.Items?.length || 0,
                },
            });
        }
        catch (error) {
            console.error('Error getting payments:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async updatePayment(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const paymentId = event.pathParameters?.id;
            if (!paymentId) {
                return this.createResponse(400, { success: false, error: 'Payment ID required' });
            }
            const updateData = JSON.parse(event.body || '{}');
            // Check if payment exists
            const existingPayment = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: PAYMENTS_TABLE,
                Key: { id: paymentId },
            }));
            if (!existingPayment.Item) {
                return this.createResponse(404, { success: false, error: 'Payment not found' });
            }
            // Update payment
            let updateExpression = 'SET #status = :status, updatedAt = :updatedAt, #amount = :amount';
            const expressionAttributeValues = {
                ':status': updateData.status || existingPayment.Item.status,
                ':amount': updateData.amount || existingPayment.Item.amount,
                ':updatedAt': new Date().toISOString(),
            };
            const expressionAttributeNames = {
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
            await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                TableName: PAYMENTS_TABLE,
                Key: { id: paymentId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
            }));
            // Get updated payment
            const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: PAYMENTS_TABLE,
                Key: { id: paymentId },
            }));
            return this.createResponse(200, {
                success: true,
                data: result.Item
            });
        }
        catch (error) {
            console.error('Error updating payment:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getPaymentMethods(event) {
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
        }
        catch (error) {
            console.error('Error getting payment methods:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async webhookMercadoPago(event) {
        try {
            const webhookData = JSON.parse(event.body || '{}');
            // Verify webhook signature (in production)
            // const signature = event.headers['x-signature'];
            // const isValidSignature = this.verifyMercadoPagoSignature(webhookData, signature);
            if (webhookData.type === 'payment') {
                const paymentData = webhookData.data;
                if (paymentData.status === 'approved') {
                    // Find payment by external reference
                    const paymentResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
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
                        await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
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
        }
        catch (error) {
            console.error('Error processing Mercado Pago webhook:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
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
const paymentService = new PaymentService();
const handler = async (event) => {
    const httpMethod = event.httpMethod;
    const path = event.path;
    try {
        switch (httpMethod) {
            case 'POST':
                if (path.includes('/payments')) {
                    return await paymentService.createPayment(event);
                }
                else if (path.includes('/webhooks/mercadopago')) {
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
                }
                else if (path.includes('/payments')) {
                    return await paymentService.getPayments(event);
                }
                else if (path.includes('/payment-methods')) {
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
    }
    catch (error) {
        console.error('Unhandled error:', error);
        return paymentService.createResponse(500, {
            success: false,
            error: 'Internal server error',
        });
    }
};
exports.handler = handler;

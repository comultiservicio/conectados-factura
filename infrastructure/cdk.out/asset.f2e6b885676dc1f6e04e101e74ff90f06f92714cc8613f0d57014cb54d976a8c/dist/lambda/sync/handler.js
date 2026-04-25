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
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const uuid_1 = require("uuid");
const jwt = __importStar(require("jsonwebtoken"));
const zod_1 = require("zod");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const SYNC_QUEUE_TABLE = process.env.SYNC_QUEUE_TABLE || 'conectados-queue';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';
// Esquemas de validación
const syncItemSchema = zod_1.z.object({
    entityType: zod_1.z.string().min(1),
    entityId: zod_1.z.string().min(1),
    operation: zod_1.z.enum(['create', 'update', 'delete']),
    data: zod_1.z.string(),
    priority: zod_1.z.number().min(1).max(10).optional(),
});
const syncStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['pending', 'processing', 'completed', 'failed']),
    retryCount: zod_1.z.number().min(0).optional(),
});
class SyncService {
    async validateUser(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return decoded.sub;
        }
        catch (error) {
            throw new Error('Invalid authentication token');
        }
    }
    async addToSyncQueue(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            const syncData = JSON.parse(event.body || '{}');
            const validatedData = syncItemSchema.parse(syncData);
            const queueId = (0, uuid_1.v4)();
            const syncItem = {
                id: queueId,
                userId,
                entityType: validatedData.entityType,
                entityId: validatedData.entityId,
                operation: validatedData.operation,
                payload: validatedData.data,
                priority: validatedData.priority || 1,
                status: 'pending',
                retryCount: 0,
                attempts: 0,
                timestamp: new Date().toISOString(),
            };
            // Add to sync queue
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: SYNC_QUEUE_TABLE,
                Item: syncItem,
            }));
            return this.createResponse(201, {
                success: true,
                data: syncItem
            });
        }
        catch (error) {
            console.error('Error adding to sync queue:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getSyncQueue(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            const queryParams = event.queryStringParameters || {};
            const status = queryParams.status;
            const limit = parseInt(queryParams.limit || '50');
            // Build query parameters
            let filterExpression = 'userId = :userId';
            const expressionAttributeValues = { ':userId': userId };
            if (status) {
                filterExpression += ' AND #status = :status';
                expressionAttributeValues[':status'] = status;
            }
            const params = {
                TableName: SYNC_QUEUE_TABLE,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
                Limit: limit,
                ScanIndexForward: false, // Sort by timestamp descending
            };
            const result = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand(params));
            return this.createResponse(200, {
                success: true,
                data: result.Items || [],
            });
        }
        catch (error) {
            console.error('Error getting sync queue:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async processSyncQueue(event) {
        try {
            // This endpoint is typically called by a scheduled Lambda
            const queryParams = event.queryStringParameters || {};
            const batchSize = parseInt(queryParams.batchSize || '10');
            // Get pending items with highest priority first
            const result = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: SYNC_QUEUE_TABLE,
                IndexName: 'ByStatus',
                KeyConditionExpression: '#status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':status': 'pending',
                },
                ScanIndexForward: false, // Sort by priority descending, then timestamp
                Limit: batchSize,
            }));
            const pendingItems = result.Items || [];
            const processedItems = [];
            for (const item of pendingItems) {
                try {
                    // Process the sync operation
                    const syncResult = await this.processSyncOperation(item);
                    if (syncResult.success) {
                        // Mark as synced
                        await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                            TableName: SYNC_QUEUE_TABLE,
                            Key: { id: item.id, timestamp: item.timestamp },
                            UpdateExpression: 'SET #status = :status, processedAt = :processedAt',
                            ExpressionAttributeNames: {
                                '#status': 'status',
                            },
                            ExpressionAttributeValues: {
                                ':status': 'synced',
                                ':processedAt': new Date().toISOString(),
                            },
                        }));
                        processedItems.push({ id: item.id, status: 'synced' });
                    }
                    else {
                        // Mark as failed and increment retry count
                        const newRetryCount = (item.retryCount || 0) + 1;
                        const nextRetry = new Date(Date.now() + Math.pow(2, newRetryCount) * 60000).toISOString(); // Exponential backoff
                        await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                            TableName: SYNC_QUEUE_TABLE,
                            Key: { id: item.id, timestamp: item.timestamp },
                            UpdateExpression: 'SET #status = :status, retryCount = :retryCount, lastError = :lastError, nextRetry = :nextRetry',
                            ExpressionAttributeNames: {
                                '#status': 'status',
                            },
                            ExpressionAttributeValues: {
                                ':status': newRetryCount >= 3 ? 'failed' : 'pending',
                                ':retryCount': newRetryCount,
                                ':lastError': syncResult.error || 'Unknown error',
                                ':nextRetry': nextRetry,
                            },
                        }));
                        processedItems.push({
                            id: item.id,
                            status: 'failed',
                            error: syncResult.error,
                            retryCount: newRetryCount
                        });
                    }
                }
                catch (processError) {
                    console.error(`Error processing sync item ${item.id}:`, processError);
                    // Mark as failed
                    await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: SYNC_QUEUE_TABLE,
                        Key: { id: item.id, timestamp: item.timestamp },
                        UpdateExpression: 'SET #status = :status, lastError = :lastError, nextRetry = :nextRetry',
                        ExpressionAttributeNames: {
                            '#status': 'status',
                        },
                        ExpressionAttributeValues: {
                            ':status': 'failed',
                            ':lastError': processError instanceof Error ? processError.message : 'Processing error',
                            ':nextRetry': new Date(Date.now() + 3600000).toISOString(), // Retry in 1 hour
                        },
                    }));
                    processedItems.push({
                        id: item.id,
                        status: 'failed',
                        error: processError instanceof Error ? processError.message : 'Processing error'
                    });
                }
            }
            return this.createResponse(200, {
                success: true,
                data: {
                    processed: processedItems,
                    totalProcessed: processedItems.length,
                },
            });
        }
        catch (error) {
            console.error('Error processing sync queue:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async processSyncOperation(item) {
        try {
            const { entityType, operation, payload } = item;
            switch (entityType) {
                case 'invoice':
                    return await this.processInvoiceSync(operation, payload);
                case 'stock_movement':
                    return await this.processStockMovementSync(operation, payload);
                case 'payment':
                    return await this.processPaymentSync(operation, payload);
                case 'customer':
                    return await this.processCustomerSync(operation, payload);
                case 'product':
                    return await this.processProductSync(operation, payload);
                default:
                    return { success: false, error: `Unsupported entity type: ${entityType}` };
            }
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Sync processing failed'
            };
        }
    }
    async processInvoiceSync(operation, payload) {
        try {
            // In a real implementation, this would sync with external systems
            // For now, just validate the payload
            if (!payload.id || !payload.customerId || !payload.totalAmount) {
                return { success: false, error: 'Invalid invoice payload' };
            }
            console.log(`Syncing invoice ${operation}: ${payload.id}`);
            // Simulate external API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Invoice sync failed'
            };
        }
    }
    async processStockMovementSync(operation, payload) {
        try {
            if (!payload.id || !payload.productId || !payload.quantity) {
                return { success: false, error: 'Invalid stock movement payload' };
            }
            console.log(`Syncing stock movement ${operation}: ${payload.id}`);
            // Simulate external API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Stock movement sync failed'
            };
        }
    }
    async processPaymentSync(operation, payload) {
        try {
            if (!payload.id || !payload.invoiceId || !payload.amount) {
                return { success: false, error: 'Invalid payment payload' };
            }
            console.log(`Syncing payment ${operation}: ${payload.id}`);
            // Simulate external API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Payment sync failed'
            };
        }
    }
    async processCustomerSync(operation, payload) {
        try {
            if (!payload.id || !payload.name) {
                return { success: false, error: 'Invalid customer payload' };
            }
            console.log(`Syncing customer ${operation}: ${payload.id}`);
            // Simulate external API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Customer sync failed'
            };
        }
    }
    async processProductSync(operation, payload) {
        try {
            if (!payload.id || !payload.name || !payload.price) {
                return { success: false, error: 'Invalid product payload' };
            }
            console.log(`Syncing product ${operation}: ${payload.id}`);
            // Simulate external API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Product sync failed'
            };
        }
    }
    async getSyncStatus(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            // Get sync statistics
            const pendingResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: SYNC_QUEUE_TABLE,
                IndexName: 'ByUser',
                KeyConditionExpression: 'userId = :userId',
                FilterExpression: '#status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':status': 'pending',
                },
            }));
            const failedResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: SYNC_QUEUE_TABLE,
                IndexName: 'ByUser',
                KeyConditionExpression: 'userId = :userId',
                FilterExpression: '#status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':status': 'failed',
                },
            }));
            const syncedResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: SYNC_QUEUE_TABLE,
                IndexName: 'ByUser',
                KeyConditionExpression: 'userId = :userId',
                FilterExpression: '#status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':status': 'synced',
                },
            }));
            const status = {
                pending: pendingResult.Items?.length || 0,
                failed: failedResult.Items?.length || 0,
                synced: syncedResult.Items?.length || 0,
                total: (pendingResult.Items?.length || 0) + (failedResult.Items?.length || 0) + (syncedResult.Items?.length || 0),
            };
            return this.createResponse(200, {
                success: true,
                data: status,
            });
        }
        catch (error) {
            console.error('Error getting sync status:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async retryFailedSyncs(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            // Get failed items for this user
            const failedResult = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
                TableName: SYNC_QUEUE_TABLE,
                IndexName: 'ByUser',
                KeyConditionExpression: 'userId = :userId',
                FilterExpression: '#status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':status': 'failed',
                },
            }));
            let retriedCount = 0;
            for (const item of failedResult.Items || []) {
                // Reset failed items to pending
                await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: SYNC_QUEUE_TABLE,
                    Key: { id: item.id, timestamp: item.timestamp },
                    UpdateExpression: 'SET #status = :status, retryCount = :retryCount, lastError = :lastError',
                    ExpressionAttributeNames: {
                        '#status': 'status',
                    },
                    ExpressionAttributeValues: {
                        ':status': 'pending',
                        ':retryCount': 0,
                        ':lastError': null,
                    },
                }));
                retriedCount++;
            }
            return this.createResponse(200, {
                success: true,
                data: {
                    retried: retriedCount,
                    message: `${retriedCount} failed sync items have been reset to pending`,
                },
            });
        }
        catch (error) {
            console.error('Error retrying failed syncs:', error);
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
const syncService = new SyncService();
const handler = async (event) => {
    const httpMethod = event.httpMethod;
    const path = event.path;
    try {
        switch (httpMethod) {
            case 'POST':
                if (path.includes('/sync/queue')) {
                    return await syncService.addToSyncQueue(event);
                }
                else if (path.includes('/sync/process')) {
                    return await syncService.processSyncQueue(event);
                }
                else if (path.includes('/sync/retry')) {
                    return await syncService.retryFailedSyncs(event);
                }
                break;
            case 'GET':
                if (path.includes('/sync/queue')) {
                    return await syncService.getSyncQueue(event);
                }
                else if (path.includes('/sync/status')) {
                    return await syncService.getSyncStatus(event);
                }
                break;
            default:
                return syncService.createResponse(405, {
                    success: false,
                    error: 'Method not allowed'
                });
        }
        return syncService.createResponse(404, {
            success: false,
            error: 'Endpoint not found'
        });
    }
    catch (error) {
        console.error('Unhandled error:', error);
        return syncService.createResponse(500, {
            success: false,
            error: 'Internal server error',
        });
    }
};
exports.handler = handler;

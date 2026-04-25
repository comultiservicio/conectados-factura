import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

import { SyncQueue, ApiResponse, PaginatedResponse, DecodedToken } from '../../shared/types';
import { logError, logInfo, logMetric } from '../../shared/logger';
import { CacheManager } from '../../shared/cache';
import { RetryHelper } from '../../shared/retry';
import { Metrics } from '../../shared/metrics';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const SYNC_QUEUE_TABLE = process.env.SYNC_QUEUE_TABLE || 'conectados-queue';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';

// Esquemas de validación
const syncItemSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  operation: z.enum(['create', 'update', 'delete']),
  data: z.string(),
  priority: z.number().min(1).max(10).optional(),
});

const syncStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  retryCount: z.number().min(0).optional(),
});

class SyncService {
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

  async addToSyncQueue(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token, 'admin'); // Solo admins pueden gestionar sincronización
      const syncData = JSON.parse(event.body || '{}');
      const validatedData = syncItemSchema.parse(syncData);

      const queueId = uuidv4();
      const syncItem: SyncQueue = {
        id: queueId,
        userId: decoded.sub, // Usar el userId del token decodificado
        entityType: validatedData.entityType,
        entityId: validatedData.entityId,
        operation: validatedData.operation,
        data: validatedData.data,
        priority: validatedData.priority || 5,
        status: 'pending',
        createdAt: new Date().toISOString(),
        attempts: 0,
      } as SyncQueue;

      // Add to sync queue
      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_QUEUE_TABLE,
        Item: syncItem,
      }));

      logInfo('Sync item added to queue successfully', {
        queueId: syncItem.id,
        entityType: syncItem.entityType,
        entityId: syncItem.entityId,
        operation: syncItem.operation,
        userId: decoded.sub
      });

      await Metrics.recordSuccess('addToSyncQueue', { Role: decoded.role });
      await Metrics.recordLatency('addToSyncQueue', Date.now() - startTime);

      return this.createResponse(201, { 
        success: true, 
        data: syncItem 
      });

    } catch (error) {
      logError('Error adding to sync queue', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: decoded.sub,
        entityType: syncData.entityType
      });

      await Metrics.recordError('addToSyncQueue', error instanceof Error ? error.name : 'Unknown');
      await Metrics.recordLatency('addToSyncQueue', Date.now() - startTime);

      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getSyncQueue(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
      const expressionAttributeValues: any = { ':userId': userId };

      if (status) {
        filterExpression += ' AND #status = :status';
        expressionAttributeValues[':status'] = status;
      }

      const params: any = {
        TableName: SYNC_QUEUE_TABLE,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
        Limit: limit,
        ScanIndexForward: false, // Sort by timestamp descending
      };

      const result = await dynamoDoc.send(new QueryCommand(params));

      return this.createResponse(200, {
        success: true,
        data: result.Items || [],
      });

    } catch (error) {
      console.error('Error getting sync queue:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async processSyncQueue(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      // This endpoint is typically called by a scheduled Lambda
      const queryParams = event.queryStringParameters || {};
      const batchSize = parseInt(queryParams.batchSize || '10');

      // Get pending items with highest priority first
      const result = await dynamoDoc.send(new QueryCommand({
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
            await dynamoDoc.send(new UpdateCommand({
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
          } else {
            // Mark as failed and increment retry count
            const newRetryCount = (item.retryCount || 0) + 1;
            const nextRetry = new Date(Date.now() + Math.pow(2, newRetryCount) * 60000).toISOString(); // Exponential backoff

            await dynamoDoc.send(new UpdateCommand({
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
        } catch (processError) {
          console.error(`Error processing sync item ${item.id}:`, processError);
          
          // Mark as failed
          await dynamoDoc.send(new UpdateCommand({
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

    } catch (error) {
      console.error('Error processing sync queue:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  private async processSyncOperation(item: any): Promise<{ success: boolean; error?: string }> {
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
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sync processing failed' 
      };
    }
  }

  private async processInvoiceSync(operation: string, payload: any): Promise<{ success: boolean; error?: string }> {
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
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Invoice sync failed' 
      };
    }
  }

  private async processStockMovementSync(operation: string, payload: any): Promise<{ success: boolean; error?: string }> {
    try {
      if (!payload.id || !payload.productId || !payload.quantity) {
        return { success: false, error: 'Invalid stock movement payload' };
      }

      console.log(`Syncing stock movement ${operation}: ${payload.id}`);
      
      // Simulate external API call
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Stock movement sync failed' 
      };
    }
  }

  private async processPaymentSync(operation: string, payload: any): Promise<{ success: boolean; error?: string }> {
    try {
      if (!payload.id || !payload.invoiceId || !payload.amount) {
        return { success: false, error: 'Invalid payment payload' };
      }

      console.log(`Syncing payment ${operation}: ${payload.id}`);
      
      // Simulate external API call
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Payment sync failed' 
      };
    }
  }

  private async processCustomerSync(operation: string, payload: any): Promise<{ success: boolean; error?: string }> {
    try {
      if (!payload.id || !payload.name) {
        return { success: false, error: 'Invalid customer payload' };
      }

      console.log(`Syncing customer ${operation}: ${payload.id}`);
      
      // Simulate external API call
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Customer sync failed' 
      };
    }
  }

  private async processProductSync(operation: string, payload: any): Promise<{ success: boolean; error?: string }> {
    try {
      if (!payload.id || !payload.name || !payload.price) {
        return { success: false, error: 'Invalid product payload' };
      }

      console.log(`Syncing product ${operation}: ${payload.id}`);
      
      // Simulate external API call
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Product sync failed' 
      };
    }
  }

  async getSyncStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const userId = await this.validateUser(token);

      // Get sync statistics
      const pendingResult = await dynamoDoc.send(new QueryCommand({
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

      const failedResult = await dynamoDoc.send(new QueryCommand({
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

      const syncedResult = await dynamoDoc.send(new QueryCommand({
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

    } catch (error) {
      console.error('Error getting sync status:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async retryFailedSyncs(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const userId = await this.validateUser(token);

      // Get failed items for this user
      const failedResult = await dynamoDoc.send(new QueryCommand({
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
        await dynamoDoc.send(new UpdateCommand({
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

    } catch (error) {
      console.error('Error retrying failed syncs:', error);
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

const syncService = new SyncService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  try {
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/sync/queue')) {
          return await syncService.addToSyncQueue(event);
        } else if (path.includes('/sync/process')) {
          return await syncService.processSyncQueue(event);
        } else if (path.includes('/sync/retry')) {
          return await syncService.retryFailedSyncs(event);
        }
        break;
      case 'GET':
        if (path.includes('/sync/queue')) {
          return await syncService.getSyncQueue(event);
        } else if (path.includes('/sync/status')) {
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

  } catch (error) {
    console.error('Unhandled error:', error);
    return syncService.createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};

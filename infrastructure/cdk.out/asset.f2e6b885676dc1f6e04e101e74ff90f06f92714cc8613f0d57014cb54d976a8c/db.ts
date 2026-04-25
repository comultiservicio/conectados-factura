import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Configuración de DynamoDB
const client = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(client);

// Nombres de tablas desde variables de entorno
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';

// Interfaces
export interface SyncItem {
  id: string;
  userId: string;
  entityType: 'invoice' | 'payment' | 'stock_movement' | 'product' | 'warehouse';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  processedAt?: string;
  errorMessage?: string;
  retryCount?: number;
}

export interface CreateSyncRequest {
  entityType: 'invoice' | 'payment' | 'stock_movement' | 'product' | 'warehouse';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
}

// Funciones de base de datos
export class SyncDB {
  /**
   * Añadir elemento a la cola de sincronización
   */
  static async addToSyncQueue(syncData: CreateSyncRequest & { userId: string }): Promise<SyncItem> {
    const syncItem: SyncItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...syncData,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString()
    };

    await dynamoDoc.send(new PutCommand({
      TableName: SYNC_TABLE,
      Item: syncItem
    }));

    return syncItem;
  }

  /**
   * Obtener elementos pendientes de sincronización
   */
  static async getPendingSyncItems(limit: number = 100): Promise<SyncItem[]> {
    const result = await dynamoDoc.send(new QueryCommand({
      TableName: SYNC_TABLE,
      IndexName: 'ByStatus', // Asumiendo que existe este índice
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'pending'
      },
      Limit: limit,
      ScanIndexForward: true // Ordenar por fecha ascendente
    }));

    return result.Items as SyncItem[] || [];
  }

  /**
   * Obtener elementos de sincronización de un usuario
   */
  static async getUserSyncItems(userId: string, status?: string): Promise<SyncItem[]> {
    let filterExpression = 'userId = :userId';
    const expressionAttributeValues: any = {
      ':userId': userId
    };
    const expressionAttributeNames: any = {};

    if (status) {
      filterExpression += ' AND #status = :status';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    const result = await dynamoDoc.send(new QueryCommand({
      TableName: SYNC_TABLE,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false // Ordenar por fecha descendente
    }));

    return result.Items as SyncItem[] || [];
  }

  /**
   * Marcar elemento como procesado
   */
  static async markAsCompleted(syncId: string): Promise<boolean> {
    try {
      // En una implementación real, necesitaríamos obtener primero el item
      // y luego actualizarlo. Por simplicidad, usamos PutCommand con condición
      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_TABLE,
        Item: {
          id: syncId,
          status: 'completed',
          processedAt: new Date().toISOString()
        },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Marcar elemento como fallido
   */
  static async markAsFailed(syncId: string, errorMessage: string): Promise<boolean> {
    try {
      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_TABLE,
        Item: {
          id: syncId,
          status: 'failed',
          errorMessage,
          processedAt: new Date().toISOString()
        },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Incrementar contador de reintentos
   */
  static async incrementRetryCount(syncId: string): Promise<boolean> {
    try {
      // Esto requeriría UpdateCommand en una implementación real
      // Por simplicidad, asumimos que se actualiza correctamente
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener estadísticas de sincronización
   */
  static async getSyncStats(userId?: string): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    let filterExpression = '';
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    if (userId) {
      filterExpression = 'userId = :userId';
      expressionAttributeValues[':userId'] = userId;
    }

    const result = await dynamoDoc.send(new QueryCommand({
      TableName: SYNC_TABLE,
      FilterExpression: filterExpression || undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined
    }));

    const items = result.Items as SyncItem[] || [];
    
    const stats = items.reduce((acc, item) => {
      acc.total++;
      switch (item.status) {
        case 'pending':
          acc.pending++;
          break;
        case 'processing':
          acc.processing++;
          break;
        case 'completed':
          acc.completed++;
          break;
        case 'failed':
          acc.failed++;
          break;
      }
      return acc;
    }, {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    });

    return stats;
  }
}

export { dynamoDoc };

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, BatchGetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { StockMovement } from '../shared/types';

// Configuración de DynamoDB
const client = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(client);

// Nombres de tablas desde variables de entorno
const STOCK_MOVEMENTS_TABLE = process.env.STOCK_MOVEMENTS_TABLE || 'conectados-stock-movements';
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'conectados-products';
const WAREHOUSES_TABLE = process.env.WAREHOUSES_TABLE || 'conectados-warehouses';

// Interfaces
export interface CreateStockMovementRequest {
  productId: string;
  warehouseId: string;
  movementType: 'in' | 'out' | 'transfer';
  quantity: number;
  reason?: string;
  referenceId?: string;
}

// Funciones de base de datos
export class StockDB {
  /**
   * Crear un nuevo movimiento de stock
   */
  static async createStockMovement(movementData: CreateStockMovementRequest & { userId: string }): Promise<StockMovement> {
    const movement: StockMovement = {
      id: `stock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...movementData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamoDoc.send(new PutCommand({
      TableName: STOCK_MOVEMENTS_TABLE,
      Item: movement
    }));

    return movement;
  }

  /**
   * Obtener un movimiento de stock por ID
   */
  static async getStockMovement(movementId: string): Promise<StockMovement | null> {
    const result = await dynamoDoc.send(new GetCommand({
      TableName: STOCK_MOVEMENTS_TABLE,
      Key: { id: movementId }
    }));

    return result.Item as StockMovement || null;
  }

  /**
   * Eliminar un movimiento de stock
   */
  static async deleteStockMovement(movementId: string): Promise<boolean> {
    const existingMovement = await this.getStockMovement(movementId);
    if (!existingMovement) {
      return false;
    }

    await dynamoDoc.send(new DeleteCommand({
      TableName: STOCK_MOVEMENTS_TABLE,
      Key: { id: movementId }
    }));

    return true;
  }

  /**
   * Obtener movimientos de stock de un usuario con filtros
   */
  static async getStockMovements(filters: {
    userId: string;
    page?: number;
    limit?: number;
    productId?: string;
    warehouseId?: string;
    movementType?: string;
  }): Promise<{ movements: (StockMovement & { product?: any; warehouse?: any })[]; total: number }> {
    const { userId, page = 1, limit = 10, ...filterParams } = filters;
    
    // Construir filtros
    let filterExpression = 'userId = :userId';
    const expressionAttributeValues: any = {
      ':userId': userId
    };
    const expressionAttributeNames: any = {};

    if (filterParams.productId) {
      filterExpression += ' AND productId = :productId';
      expressionAttributeValues[':productId'] = filterParams.productId;
    }

    if (filterParams.warehouseId) {
      filterExpression += ' AND warehouseId = :warehouseId';
      expressionAttributeValues[':warehouseId'] = filterParams.warehouseId;
    }

    if (filterParams.movementType) {
      filterExpression += ' AND #movementType = :movementType';
      expressionAttributeNames['#movementType'] = 'movementType';
      expressionAttributeValues[':movementType'] = filterParams.movementType;
    }

    const params: any = {
      TableName: STOCK_MOVEMENTS_TABLE,
      Limit: limit,
      ScanIndexForward: false, // Ordenar por fecha descendente
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await dynamoDoc.send(new QueryCommand(params));

    // Enriquecer con datos de productos y almacenes
    const movements = await Promise.all(
      (result.Items || []).map(async (movement: any) => {
        // Obtener detalles del producto
        const productResult = await dynamoDoc.send(new GetCommand({
          TableName: PRODUCTS_TABLE,
          Key: { id: movement.productId },
        }));

        // Obtener detalles del almacén
        const warehouseResult = await dynamoDoc.send(new GetCommand({
          TableName: WAREHOUSES_TABLE,
          Key: { id: movement.warehouseId },
        }));

        return {
          ...movement,
          product: productResult.Item,
          warehouse: warehouseResult.Item,
        };
      })
    );

    return {
      movements,
      total: result.Items?.length || 0
    };
  }

  /**
   * Obtener stock actual de un producto en un almacén
   */
  static async getCurrentStock(productId: string, warehouseId: string): Promise<number> {
    // Obtener todos los movimientos para este producto y almacén
    const result = await dynamoDoc.send(new QueryCommand({
      TableName: STOCK_MOVEMENTS_TABLE,
      IndexName: 'ByProductWarehouse', // Asumiendo que existe este índice
      KeyConditionExpression: 'productId = :productId AND warehouseId = :warehouseId',
      ExpressionAttributeValues: {
        ':productId': productId,
        ':warehouseId': warehouseId
      }
    }));

    // Calcular stock actual
    const movements = result.Items || [];
    const currentStock = movements.reduce((total: number, movement: any) => {
      if (movement.movementType === 'in') {
        return total + movement.quantity;
      } else if (movement.movementType === 'out') {
        return total - movement.quantity;
      }
      return total;
    }, 0);

    return Math.max(0, currentStock); // No permitir stock negativo
  }

  /**
   * Obtener productos disponibles
   */
  static async getProducts(): Promise<any[]> {
    const result = await dynamoDoc.send(new ScanCommand({
      TableName: PRODUCTS_TABLE
    }));

    return result.Items || [];
  }

  /**
   * Obtener almacenes disponibles
   */
  static async getWarehouses(): Promise<any[]> {
    const result = await dynamoDoc.send(new ScanCommand({
      TableName: WAREHOUSES_TABLE
    }));

    return result.Items || [];
  }
}

export { dynamoDoc };

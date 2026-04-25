import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  BatchGetCommand 
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

// Importar tipos compartidos
import { StockMovement, Product, Warehouse, ApiResponse, PaginatedResponse, DecodedToken } from '../../shared/types';
import { logError, logInfo, logMetric } from '../../shared/logger';

// Configuración de clientes de AWS
const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);

// Nombres de tablas desde variables de entorno
const STOCK_MOVEMENTS_TABLE = process.env.STOCK_MOVEMENTS_TABLE || 'conectados-stock-movements';
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'conectados-products';
const WAREHOUSES_TABLE = process.env.WAREHOUSES_TABLE || 'conectados-warehouses';
const CURRENT_STOCK_TABLE = process.env.CURRENT_STOCK_TABLE || 'conectados-current-stock';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';

// Esquemas de validación
const movementSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  movementType: z.enum(['in', 'out', 'adjustment']),
  quantity: z.number().positive(),
  unitCost: z.number().optional(),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  notes: z.string().optional(),
});

class StockService {
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

  private async updateCurrentStock(
    productId: string, 
    warehouseId: string, 
    quantity: number, 
    movementType: 'in' | 'out' | 'adjustment'
  ): Promise<void> {
    try {
      const currentStockKey = { productId, warehouseId };
      const currentStock = await dynamoDoc.send(new GetCommand({
        TableName: CURRENT_STOCK_TABLE,
        Key: currentStockKey,
      }));

      let newQuantity = quantity;
      if (currentStock.Item) {
        const currentQuantity = currentStock.Item.quantity || 0;
        if (movementType === 'in') {
          newQuantity = currentQuantity + quantity;
        } else if (movementType === 'out') {
          newQuantity = currentQuantity - quantity;
        } else if (movementType === 'adjustment') {
          newQuantity = quantity;
        }
      }

      await dynamoDoc.send(new PutCommand({
        TableName: CURRENT_STOCK_TABLE,
        Item: {
          ...currentStockKey,
          quantity: newQuantity,
          lastUpdated: new Date().toISOString(),
        },
      }));
    } catch (error) {
      console.error('Error updating current stock:', error);
      throw new Error('Failed to update current stock');
    }
  }

  private async checkStockAlerts(productId: string, warehouseId: string, newQuantity: number): Promise<void> {
    try {
      const product = await dynamoDoc.send(new GetCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id: productId },
      }));

      if (product.Item && newQuantity <= (product.Item.minStockLevel || 0)) {
        console.log(`Low stock alert: Product ${productId} in warehouse ${warehouseId} has ${newQuantity} units`);
      }
    } catch (error) {
      console.error('Error checking stock alerts:', error);
    }
  }

  async createStockMovement(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token, 'user'); // Solo usuarios pueden crear movimientos
      const movementData = JSON.parse(event.body || '{}');
      const validatedData = movementSchema.parse(movementData);

      const movement: StockMovement = {
        id: uuidv4(),
        productId: validatedData.productId,
        warehouseId: validatedData.warehouseId,
        movementType: validatedData.movementType,
        quantity: validatedData.quantity,
        unitCost: validatedData.unitCost,
        referenceId: validatedData.referenceId,
        referenceType: validatedData.referenceType,
        notes: validatedData.notes,
        userId: decoded.sub, // Usar el userId del token decodificado
        timestamp: new Date().toISOString(),
      } as StockMovement;

      // Save stock movement
      await dynamoDoc.send(new PutCommand({
        TableName: STOCK_MOVEMENTS_TABLE,
        Item: movement,
      }));

      // Update current stock
      await this.updateCurrentStock(
        movement.productId,
        movement.warehouseId,
        movement.quantity,
        movement.movementType
      );

      // Check for stock alerts
      const currentStock = await dynamoDoc.send(new GetCommand({
        TableName: CURRENT_STOCK_TABLE,
        Key: { productId: movement.productId, warehouseId: movement.warehouseId },
      }));

      if (currentStock.Item) {
        await this.checkStockAlerts(movement.productId, movement.warehouseId, currentStock.Item.quantity);
      }

      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_TABLE,
        Item: {
          userId,
          timestamp: new Date().toISOString(),
          entityType: 'stock_movement',
          entityId: movement.id,
          operation: 'create',
          data: JSON.stringify(movement),
          status: 'synced',
        },
      }));

      return this.createResponse(201, { success: true, data: movement });

    } catch (error) {
      console.error('Error creating stock movement:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getStockMovements(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const page = parseInt(queryParams.page || '1');
      const limit = parseInt(queryParams.limit || '10');
      const productId = queryParams.productId;
      const warehouseId = queryParams.warehouseId;
      const movementType = queryParams.movementType;
      const dateFrom = queryParams.dateFrom;
      const dateTo = queryParams.dateTo;

      // Build query parameters
      let filterExpression = '';
      const expressionAttributeValues: any = {};
      const expressionAttributeNames: any = {};

      if (productId) {
        filterExpression += 'productId = :productId';
        expressionAttributeValues[':productId'] = productId;
      }

      if (warehouseId) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += 'warehouseId = :warehouseId';
        expressionAttributeValues[':warehouseId'] = warehouseId;
      }

      if (movementType) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += '#movementType = :movementType';
        expressionAttributeNames['#movementType'] = 'movementType';
        expressionAttributeValues[':movementType'] = movementType;
      }

      const params: any = {
        TableName: STOCK_MOVEMENTS_TABLE,
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

      const result = await dynamoDoc.send(new QueryCommand(params));

      // Enrich with product and warehouse data
      const movements = await Promise.all(
        (result.Items || []).map(async (movement: any) => {
          // Get product details
          const productResult = await dynamoDoc.send(new GetCommand({
            TableName: PRODUCTS_TABLE,
            Key: { id: movement.productId },
          }));

          // Get warehouse details
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

      return this.createResponse(200, {
        success: true,
        data: movements,
        pagination: {
          page,
          limit,
          total: result.Items?.length || 0,
        },
      });

    } catch (error) {
      console.error('Error getting stock movements:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getStockMovement(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token);
      const movementId = event.pathParameters?.id;
      
      const movement = await dynamoDoc.send(new GetCommand({
        TableName: STOCK_MOVEMENTS_TABLE,
        Key: { id: movementId },
      }));
      
      if (!movement.Item) {
        return this.createResponse(404, { success: false, error: 'Stock movement not found' });
      }
      
      // Validación de permisos: solo el usuario propietario puede ver el movimiento
      if (movement.Item.userId !== decoded.sub) {
        logError('Access denied: user trying to access another user\'s stock movement', {
          userId: decoded.sub,
          movementId: movementId,
          movementUserId: movement.Item.userId
        });
        return this.createResponse(403, { success: false, error: 'Access denied' });
      }
      
      logInfo('Stock movement retrieved successfully', {
        movementId: movementId,
        userId: decoded.sub
      });

      await Metrics.recordSuccess('getStockMovement', { Role: decoded.role });
      await Metrics.recordLatency('getStockMovement', Date.now() - startTime);

      return this.createResponse(200, { success: true, data: movement.Item });
    } catch (error) {
      logError('Error getting stock movement', {
        error: error instanceof Error ? error.message : 'Unknown error',
        movementId: event.pathParameters?.id
      });

      await Metrics.recordError('getStockMovement', error instanceof Error ? error.name : 'Unknown');
      await Metrics.recordLatency('getStockMovement', Date.now() - startTime);

      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getCurrentStock(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const productId = queryParams.productId;
      const warehouseId = queryParams.warehouseId;

      if (!productId || !warehouseId) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Product ID and warehouse ID are required' 
        });
      }

      const result = await dynamoDoc.send(new GetCommand({
        TableName: CURRENT_STOCK_TABLE,
        Key: { productId, warehouseId },
      }));

      if (!result.Item) {
        return this.createResponse(200, { 
          success: true, 
          data: { productId, warehouseId, quantity: 0 } 
        });
      }

      return this.createResponse(200, { 
        success: true, 
        data: result.Item 
      });

    } catch (error) {
      console.error('Error getting current stock:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getStockSummary(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const warehouseId = queryParams.warehouseId;
      const lowStock = queryParams.lowStock === 'true';

      // Get all current stock records
      const params: any = {
        TableName: CURRENT_STOCK_TABLE,
      };

      if (warehouseId) {
        params.IndexName = 'ByWarehouse';
        params.KeyConditionExpression = 'warehouseId = :warehouseId';
        params.ExpressionAttributeValues = { ':warehouseId': warehouseId };
      }

      const result = await dynamoDoc.send(new QueryCommand(params));

      // Enrich with product data
      const stockSummary = await Promise.all(
        (result.Items || []).map(async (stockItem: any) => {
          const productResult = await dynamoDoc.send(new GetCommand({
            TableName: PRODUCTS_TABLE,
            Key: { id: stockItem.productId },
          }));

          const product = productResult.Item;
          const minStockLevel = product?.minStockLevel || 0;
          const currentQuantity = stockItem.quantity || 0;
          
          let stockStatus = 'normal';
          if (currentQuantity <= minStockLevel) {
            stockStatus = 'critical';
          } else if (currentQuantity <= minStockLevel * 2) {
            stockStatus = 'low';
          }

          return {
            productId: stockItem.productId,
            warehouseId: stockItem.warehouseId,
            currentQuantity,
            minStockLevel,
            stockStatus,
            product: {
              name: product?.name,
              sku: product?.sku,
              unit: product?.unit,
              price: product?.price,
            },
            lastUpdated: stockItem.lastUpdated,
          };
        })
      );

      // Filter by low stock if requested
      let filteredSummary = stockSummary;
      if (lowStock) {
        filteredSummary = stockSummary.filter((item: any) => 
          item.stockStatus === 'critical' || item.stockStatus === 'low'
        );
      }

      return this.createResponse(200, {
        success: true,
        data: filteredSummary,
        summary: {
          totalProducts: stockSummary.length,
          lowStockProducts: stockSummary.filter((item: any) => item.stockStatus === 'low').length,
          criticalStockProducts: stockSummary.filter((item: any) => item.stockStatus === 'critical').length,
        },
      });

    } catch (error) {
      console.error('Error getting stock summary:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async adjustStock(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const userId = await this.validateUser(token);
      const adjustmentData: Partial<StockMovement> = JSON.parse(event.body || '{}');

      // Validate required fields
      if (!adjustmentData.productId || !adjustmentData.warehouseId || adjustmentData.quantity === undefined) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Product ID, warehouse ID, and quantity are required' 
        });
      }

      const movementId = uuidv4();
      const adjustment: StockMovement = {
        id: movementId,
        productId: adjustmentData.productId!,
        warehouseId: adjustmentData.warehouseId!,
        movementType: 'adjustment',
        quantity: adjustmentData.quantity!,
        unitCost: adjustmentData.unitCost,
        referenceType: 'manual_adjustment',
        driverId: adjustmentData.driverId || userId,
        notes: adjustmentData.notes || 'Manual stock adjustment',
        createdAt: new Date().toISOString(),
      } as StockMovement;

      // Save adjustment
      await dynamoDoc.send(new PutCommand({
        TableName: STOCK_MOVEMENTS_TABLE,
        Item: adjustment,
      }));

      // Update current stock directly to the new quantity
      await this.updateCurrentStock(
        adjustment.productId,
        adjustment.warehouseId,
        adjustment.quantity,
        'adjustment'
      );

      // Check for stock alerts
      await this.checkStockAlerts(adjustment.productId, adjustment.warehouseId, adjustment.quantity);

      // Add to sync queue
      await dynamoDoc.send(new PutCommand({
        TableName: SYNC_TABLE,
        Item: {
          userId,
          timestamp: new Date().toISOString(),
          entityType: 'stock_adjustment',
          entityId: movementId,
          operation: 'create',
          data: JSON.stringify(adjustment),
          status: 'synced',
        },
      }));

      logInfo('Stock adjustment created successfully', {
        movementId: adjustment.id,
        productId: adjustment.productId,
        warehouseId: adjustment.warehouseId,
        movementType: adjustment.movementType,
        userId: userId
      });

      logMetric('adjustStock', Date.now() - new Date(adjustment.createdAt).getTime(), true, userId);

      return this.createResponse(201, { 
        success: true, 
        data: adjustment 
      });

    } catch (error) {
      logError('Error adjusting stock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId,
        productId: adjustmentData.productId,
        warehouseId: adjustmentData.warehouseId
      });
      
      logMetric('adjustStock', Date.now() - new Date().getTime(), false, userId);

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

const stockService = new StockService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  try {
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/stock/movements')) {
          return await stockService.createStockMovement(event);
        } else if (path.includes('/stock/adjust')) {
          return await stockService.adjustStock(event);
        }
        break;
      case 'GET':
        if (path.includes('/stock/movements')) {
          return await stockService.getStockMovements(event);
        } else if (path.includes('/stock/current')) {
          return await stockService.getCurrentStock(event);
        } else if (path.includes('/stock/summary')) {
          return await stockService.getStockSummary(event);
        }
        break;
      default:
        return stockService.createResponse(405, { 
          success: false, 
          error: 'Method not allowed' 
        });
    }

    return stockService.createResponse(404, { 
      success: false, 
      error: 'Endpoint not found' 
    });

  } catch (error) {
    console.error('Unhandled error:', error);
    return stockService.createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};

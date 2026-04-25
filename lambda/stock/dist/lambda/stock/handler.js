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
const uuid_1 = require("uuid");
const jwt = __importStar(require("jsonwebtoken"));
const zod_1 = require("zod");
// Configuración de clientes de AWS
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Nombres de tablas desde variables de entorno
const STOCK_MOVEMENTS_TABLE = process.env.STOCK_MOVEMENTS_TABLE || 'conectados-stock-movements';
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || 'conectados-products';
const WAREHOUSES_TABLE = process.env.WAREHOUSES_TABLE || 'conectados-warehouses';
const CURRENT_STOCK_TABLE = process.env.CURRENT_STOCK_TABLE || 'conectados-current-stock';
const SYNC_TABLE = process.env.SYNC_TABLE || 'conectados-sync';
// Esquemas de validación
const movementSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1),
    warehouseId: zod_1.z.string().min(1),
    movementType: zod_1.z.enum(['in', 'out', 'adjustment']),
    quantity: zod_1.z.number().positive(),
    unitCost: zod_1.z.number().optional(),
    referenceId: zod_1.z.string().optional(),
    referenceType: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
class StockService {
    async validateUser(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return decoded.sub;
        }
        catch (error) {
            throw new Error('Invalid authentication token');
        }
    }
    async updateCurrentStock(productId, warehouseId, quantity, movementType) {
        try {
            const currentStockKey = { productId, warehouseId };
            const currentStock = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: CURRENT_STOCK_TABLE,
                Key: currentStockKey,
            }));
            let newQuantity = quantity;
            if (currentStock.Item) {
                const currentQuantity = currentStock.Item.quantity || 0;
                if (movementType === 'in') {
                    newQuantity = currentQuantity + quantity;
                }
                else if (movementType === 'out') {
                    newQuantity = currentQuantity - quantity;
                }
                else if (movementType === 'adjustment') {
                    newQuantity = quantity;
                }
            }
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: CURRENT_STOCK_TABLE,
                Item: {
                    ...currentStockKey,
                    quantity: newQuantity,
                    lastUpdated: new Date().toISOString(),
                },
            }));
        }
        catch (error) {
            console.error('Error updating current stock:', error);
            throw new Error('Failed to update current stock');
        }
    }
    async checkStockAlerts(productId, warehouseId, newQuantity) {
        try {
            const product = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: PRODUCTS_TABLE,
                Key: { id: productId },
            }));
            if (product.Item && newQuantity <= (product.Item.minStockLevel || 0)) {
                console.log(`Low stock alert: Product ${productId} in warehouse ${warehouseId} has ${newQuantity} units`);
            }
        }
        catch (error) {
            console.error('Error checking stock alerts:', error);
        }
    }
    async createStockMovement(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            const movementData = JSON.parse(event.body || '{}');
            const validatedData = movementSchema.parse(movementData);
            const movement = {
                id: (0, uuid_1.v4)(),
                productId: validatedData.productId,
                warehouseId: validatedData.warehouseId,
                movementType: validatedData.movementType,
                quantity: validatedData.quantity,
                unitCost: validatedData.unitCost,
                referenceId: validatedData.referenceId,
                referenceType: validatedData.referenceType,
                driverId: userId,
                notes: validatedData.notes,
                createdAt: new Date().toISOString(),
            };
            // Save stock movement
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: STOCK_MOVEMENTS_TABLE,
                Item: movement,
            }));
            // Update current stock
            await this.updateCurrentStock(movement.productId, movement.warehouseId, movement.quantity, movement.movementType);
            // Check for stock alerts
            const currentStock = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: CURRENT_STOCK_TABLE,
                Key: { productId: movement.productId, warehouseId: movement.warehouseId },
            }));
            if (currentStock.Item) {
                await this.checkStockAlerts(movement.productId, movement.warehouseId, currentStock.Item.quantity);
            }
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
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
        }
        catch (error) {
            console.error('Error creating stock movement:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getStockMovements(event) {
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
            const expressionAttributeValues = {};
            const expressionAttributeNames = {};
            if (productId) {
                filterExpression += 'productId = :productId';
                expressionAttributeValues[':productId'] = productId;
            }
            if (warehouseId) {
                if (filterExpression)
                    filterExpression += ' AND ';
                filterExpression += 'warehouseId = :warehouseId';
                expressionAttributeValues[':warehouseId'] = warehouseId;
            }
            if (movementType) {
                if (filterExpression)
                    filterExpression += ' AND ';
                filterExpression += '#movementType = :movementType';
                expressionAttributeNames['#movementType'] = 'movementType';
                expressionAttributeValues[':movementType'] = movementType;
            }
            const params = {
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
            const result = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand(params));
            // Enrich with product and warehouse data
            const movements = await Promise.all((result.Items || []).map(async (movement) => {
                // Get product details
                const productResult = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                    TableName: PRODUCTS_TABLE,
                    Key: { id: movement.productId },
                }));
                // Get warehouse details
                const warehouseResult = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                    TableName: WAREHOUSES_TABLE,
                    Key: { id: movement.warehouseId },
                }));
                return {
                    ...movement,
                    product: productResult.Item,
                    warehouse: warehouseResult.Item,
                };
            }));
            return this.createResponse(200, {
                success: true,
                data: movements,
                pagination: {
                    page,
                    limit,
                    total: result.Items?.length || 0,
                },
            });
        }
        catch (error) {
            console.error('Error getting stock movements:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getCurrentStock(event) {
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
            const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
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
        }
        catch (error) {
            console.error('Error getting current stock:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getStockSummary(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const queryParams = event.queryStringParameters || {};
            const warehouseId = queryParams.warehouseId;
            const lowStock = queryParams.lowStock === 'true';
            // Get all current stock records
            const params = {
                TableName: CURRENT_STOCK_TABLE,
            };
            if (warehouseId) {
                params.IndexName = 'ByWarehouse';
                params.KeyConditionExpression = 'warehouseId = :warehouseId';
                params.ExpressionAttributeValues = { ':warehouseId': warehouseId };
            }
            const result = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand(params));
            // Enrich with product data
            const stockSummary = await Promise.all((result.Items || []).map(async (stockItem) => {
                const productResult = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                    TableName: PRODUCTS_TABLE,
                    Key: { id: stockItem.productId },
                }));
                const product = productResult.Item;
                const minStockLevel = product?.minStockLevel || 0;
                const currentQuantity = stockItem.quantity || 0;
                let stockStatus = 'normal';
                if (currentQuantity <= minStockLevel) {
                    stockStatus = 'critical';
                }
                else if (currentQuantity <= minStockLevel * 2) {
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
            }));
            // Filter by low stock if requested
            let filteredSummary = stockSummary;
            if (lowStock) {
                filteredSummary = stockSummary.filter((item) => item.stockStatus === 'critical' || item.stockStatus === 'low');
            }
            return this.createResponse(200, {
                success: true,
                data: filteredSummary,
                summary: {
                    totalProducts: stockSummary.length,
                    lowStockProducts: stockSummary.filter((item) => item.stockStatus === 'low').length,
                    criticalStockProducts: stockSummary.filter((item) => item.stockStatus === 'critical').length,
                },
            });
        }
        catch (error) {
            console.error('Error getting stock summary:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async adjustStock(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
            const adjustmentData = JSON.parse(event.body || '{}');
            // Validate required fields
            if (!adjustmentData.productId || !adjustmentData.warehouseId || adjustmentData.quantity === undefined) {
                return this.createResponse(400, {
                    success: false,
                    error: 'Product ID, warehouse ID, and quantity are required'
                });
            }
            const movementId = (0, uuid_1.v4)();
            const adjustment = {
                id: movementId,
                productId: adjustmentData.productId,
                warehouseId: adjustmentData.warehouseId,
                movementType: 'adjustment',
                quantity: adjustmentData.quantity,
                unitCost: adjustmentData.unitCost,
                referenceType: 'manual_adjustment',
                driverId: adjustmentData.driverId || userId,
                notes: adjustmentData.notes || 'Manual stock adjustment',
                createdAt: new Date().toISOString(),
            };
            // Save adjustment
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: STOCK_MOVEMENTS_TABLE,
                Item: adjustment,
            }));
            // Update current stock directly to the new quantity
            await this.updateCurrentStock(adjustment.productId, adjustment.warehouseId, adjustment.quantity, 'adjustment');
            // Check for stock alerts
            await this.checkStockAlerts(adjustment.productId, adjustment.warehouseId, adjustment.quantity);
            // Add to sync queue
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
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
            return this.createResponse(201, {
                success: true,
                data: adjustment
            });
        }
        catch (error) {
            console.error('Error adjusting stock:', error);
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
const stockService = new StockService();
const handler = async (event) => {
    const httpMethod = event.httpMethod;
    const path = event.path;
    try {
        switch (httpMethod) {
            case 'POST':
                if (path.includes('/stock/movements')) {
                    return await stockService.createStockMovement(event);
                }
                else if (path.includes('/stock/adjust')) {
                    return await stockService.adjustStock(event);
                }
                break;
            case 'GET':
                if (path.includes('/stock/movements')) {
                    return await stockService.getStockMovements(event);
                }
                else if (path.includes('/stock/current')) {
                    return await stockService.getCurrentStock(event);
                }
                else if (path.includes('/stock/summary')) {
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
    }
    catch (error) {
        console.error('Unhandled error:', error);
        return stockService.createResponse(500, {
            success: false,
            error: 'Internal server error',
        });
    }
};
exports.handler = handler;

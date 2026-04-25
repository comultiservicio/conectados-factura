import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Product, Warehouse } from '../types';

export class CacheManager {
  private static productCache = new Map<string, Product>();
  private static warehouseCache = new Map<string, Warehouse>();
  private static cacheTimeout = 5 * 60 * 1000; // 5 minutes in milliseconds
  private static cacheTimestamps = new Map<string, number>();
  
  static async getProduct(id: string, dynamoDoc: DynamoDBDocumentClient, tableName: string): Promise<Product | null> {
    const cacheKey = `product:${id}`;
    const timestamp = this.cacheTimestamps.get(cacheKey);
    
    // Check if cache is valid
    if (this.productCache.has(id) && timestamp && (Date.now() - timestamp) < this.cacheTimeout) {
      return this.productCache.get(id)!;
    }
    
    try {
      const result = await dynamoDoc.send(new GetCommand({
        TableName: tableName,
        Key: { id },
      }));
      
      if (result.Item) {
        this.productCache.set(id, result.Item as Product);
        this.cacheTimestamps.set(cacheKey, Date.now());
      }
      
      return result.Item as Product || null;
    } catch (error) {
      console.error('Cache error getting product:', error);
      return null;
    }
  }
  
  static async getWarehouse(id: string, dynamoDoc: DynamoDBDocumentClient, tableName: string): Promise<Warehouse | null> {
    const cacheKey = `warehouse:${id}`;
    const timestamp = this.cacheTimestamps.get(cacheKey);
    
    // Check if cache is valid
    if (this.warehouseCache.has(id) && timestamp && (Date.now() - timestamp) < this.cacheTimeout) {
      return this.warehouseCache.get(id)!;
    }
    
    try {
      const result = await dynamoDoc.send(new GetCommand({
        TableName: tableName,
        Key: { id },
      }));
      
      if (result.Item) {
        this.warehouseCache.set(id, result.Item as Warehouse);
        this.cacheTimestamps.set(cacheKey, Date.now());
      }
      
      return result.Item as Warehouse || null;
    } catch (error) {
      console.error('Cache error getting warehouse:', error);
      return null;
    }
  }
  
  static clearProduct(id: string): void {
    const cacheKey = `product:${id}`;
    this.productCache.delete(id);
    this.cacheTimestamps.delete(cacheKey);
  }
  
  static clearWarehouse(id: string): void {
    const cacheKey = `warehouse:${id}`;
    this.warehouseCache.delete(id);
    this.cacheTimestamps.delete(cacheKey);
  }
  
  static clearCache(): void {
    this.productCache.clear();
    this.warehouseCache.clear();
    this.cacheTimestamps.clear();
  }
  
  static getCacheStats(): {
    productCacheSize: number;
    warehouseCacheSize: number;
    totalTimestamps: number;
  } {
    return {
      productCacheSize: this.productCache.size,
      warehouseCacheSize: this.warehouseCache.size,
      totalTimestamps: this.cacheTimestamps.size,
    };
  }
}

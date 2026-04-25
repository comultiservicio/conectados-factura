import { CacheManager } from '../cache';
import { jest } from '@jest/globals';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Mock de DynamoDB
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

const mockDynamoDoc = {
  send: jest.fn(),
} as unknown as jest.Mocked<DynamoDBDocumentClient>;

describe('CacheManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Limpiar caché
    CacheManager['productCache'].clear();
    CacheManager['warehouseCache'].clear();
    CacheManager['cacheTimestamps'].clear();
  });
  
  test('should cache product and return from cache on second call', async () => {
    const productId = '123';
    
    // Mock de DynamoDB
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: productId, name: 'Test Product', price: 100 }
    });
    
    // Primera llamada (debería ir a DynamoDB)
    const product1 = await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    expect(product1).toEqual({ id: productId, name: 'Test Product', price: 100 });
    
    // Segunda llamada (debería ir al caché)
    const product2 = await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    expect(product2).toEqual({ id: productId, name: 'Test Product', price: 100 });
    
    // Verificar que DynamoDB fue llamado solo una vez
    expect(mockDynamoDoc.send).toHaveBeenCalledTimes(1);
  });
  
  test('should return null if product not found', async () => {
    const productId = '123';
    
    // Mock de DynamoDB: producto no encontrado
    mockDynamoDoc.send.mockResolvedValueOnce({ Item: undefined });
    
    const product = await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    expect(product).toBeNull();
  });
  
  test('should cache warehouse and return from cache on second call', async () => {
    const warehouseId = '456';
    
    // Mock de DynamoDB
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: warehouseId, name: 'Test Warehouse', location: 'Test Location' }
    });
    
    // Primera llamada (debería ir a DynamoDB)
    const warehouse1 = await CacheManager.getWarehouse(warehouseId, mockDynamoDoc, 'test-table');
    expect(warehouse1).toEqual({ id: warehouseId, name: 'Test Warehouse', location: 'Test Location' });
    
    // Segunda llamada (debería ir al caché)
    const warehouse2 = await CacheManager.getWarehouse(warehouseId, mockDynamoDoc, 'test-table');
    expect(warehouse2).toEqual({ id: warehouseId, name: 'Test Warehouse', location: 'Test Location' });
    
    // Verificar que DynamoDB fue llamado solo una vez
    expect(mockDynamoDoc.send).toHaveBeenCalledTimes(1);
  });
  
  test('should invalidate cache after timeout', async () => {
    const productId = '123';
    
    // Mock de DynamoDB
    mockDynamoDoc.send.mockResolvedValue({
      Item: { id: productId, name: 'Test Product', price: 100 }
    });
    
    // Primera llamada
    await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    
    // Simular que el caché expiró
    const cacheKey = `product:${productId}`;
    CacheManager['cacheTimestamps'].set(cacheKey, Date.now() - 6 * 60 * 1000); // 6 minutos atrás
    
    // Segunda llamada (debería ir a DynamoDB de nuevo)
    await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    
    // Verificar que DynamoDB fue llamado dos veces
    expect(mockDynamoDoc.send).toHaveBeenCalledTimes(2);
  });
  
  test('should clear product cache', async () => {
    const productId = '123';
    
    // Mock de DynamoDB
    mockDynamoDoc.send.mockResolvedValueOnce({
      Item: { id: productId, name: 'Test Product', price: 100 }
    });
    
    // Primera llamada (cachear producto)
    await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    
    // Limpiar caché
    CacheManager.clearProduct(productId);
    
    // Segunda llamada (debería ir a DynamoDB de nuevo)
    await CacheManager.getProduct(productId, mockDynamoDoc, 'test-table');
    
    // Verificar que DynamoDB fue llamado dos veces
    expect(mockDynamoDoc.send).toHaveBeenCalledTimes(2);
  });
  
  test('should get cache stats', () => {
    // Agregar elementos al caché
    CacheManager['productCache'].set('1', { id: '1', name: 'Product 1' });
    CacheManager['productCache'].set('2', { id: '2', name: 'Product 2' });
    CacheManager['warehouseCache'].set('1', { id: '1', name: 'Warehouse 1' });
    CacheManager['cacheTimestamps'].set('product:1', Date.now());
    CacheManager['cacheTimestamps'].set('product:2', Date.now());
    CacheManager['cacheTimestamps'].set('warehouse:1', Date.now());
    
    const stats = CacheManager.getCacheStats();
    
    expect(stats.productCacheSize).toBe(2);
    expect(stats.warehouseCacheSize).toBe(1);
    expect(stats.totalTimestamps).toBe(3);
  });
});

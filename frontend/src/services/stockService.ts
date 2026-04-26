import api from './api';
import { z } from 'zod';

// Validation schemas
export const stockMovementSchema = z.object({
  productId: z.string().uuid('ID de producto inválido'),
  warehouseId: z.string().uuid('ID de almacén inválido'),
  type: z.enum(['in', 'out']),
  quantity: z.number().positive('La cantidad debe ser positiva'),
  reason: z.string().min(1, 'El motivo es requerido'),
  referenceId: z.string().optional(),
});

export const productSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
  price: z.number().positive('El precio debe ser positivo'),
  sku: z.string().min(1, 'El SKU es requerido'),
  minStock: z.number().int().positive().default(10),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type ProductInput = z.infer<typeof productSchema>;

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  sku: string;
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  type: 'in' | 'out';
  quantity: number;
  reason: string;
  referenceId?: string;
  userId: string;
  createdAt: string;
}

export interface CurrentStock {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  minStock: number;
  isLow: boolean;
}

class StockService {
  // Stock Movements
  async createMovement(data: StockMovementInput): Promise<StockMovement> {
    const response = await api.post<StockMovement>('/stock/movements', data);
    return response.data;
  }

  async getMovements(params?: {
    productId?: string;
    warehouseId?: string;
    type?: 'in' | 'out';
    fromDate?: string;
    toDate?: string;
  }): Promise<StockMovement[]> {
    const response = await api.get<StockMovement[]>('/stock/movements', { params });
    return response.data;
  }

  // Current Stock
  async getCurrentStock(params?: {
    productId?: string;
    warehouseId?: string;
    isLow?: boolean;
  }): Promise<CurrentStock[]> {
    const response = await api.get<CurrentStock[]>('/stock', { params });
    return response.data;
  }

  async getStockByProductAndWarehouse(
    productId: string,
    warehouseId: string
  ): Promise<CurrentStock> {
    const response = await api.get<CurrentStock>(`/stock/${productId}/${warehouseId}`);
    return response.data;
  }

  // Products
  async getProducts(): Promise<Product[]> {
    const response = await api.get<Product[]>('/products');
    return response.data;
  }

  async createProduct(data: ProductInput): Promise<Product> {
    const response = await api.post<Product>('/products', data);
    return response.data;
  }

  async updateProduct(productId: string, data: Partial<ProductInput>): Promise<Product> {
    const response = await api.put<Product>(`/products/${productId}`, data);
    return response.data;
  }

  // Warehouses
  async getWarehouses(): Promise<Warehouse[]> {
    const response = await api.get<Warehouse[]>('/warehouses');
    return response.data;
  }

  // Low Stock Alerts
  async getLowStockAlerts(): Promise<CurrentStock[]> {
    return this.getCurrentStock({ isLow: true });
  }
}

export const stockService = new StockService();
export default stockService;

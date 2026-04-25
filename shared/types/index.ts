// Shared types used across the entire system

export interface DecodedToken {
  sub: string;
  email: string;
  role: 'admin' | 'user' | 'auditor';
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'driver' | 'customer' | 'viewer';
  companyId: string;
  isActive: boolean;
  lastLogin?: string;
  cognitoSub?: string;
}

export interface Company {
  id: string;
  name: string;
  taxId: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
  price: number;
  cost?: number;
  ivaRate: number;
  isActive: boolean;
  barcode?: string;
  minStockLevel: number;
  currentStock?: number;
}

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  creditLimit: number;
  isActive: boolean;
  balance?: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceType: 'A' | 'B' | 'C';
  documentType: 'factura' | 'remito' | 'nota_credito' | 'nota_debito';
  cae?: string;
  caeDueDate?: string;
  issueDate: string;
  totalAmount: number;
  netAmount: number;
  ivaAmount: number;
  otherTaxes: number;
  currency: string;
  exchangeRate: number;
  status: 'draft' | 'issued' | 'cancelled' | 'paid';
  notes?: string;
  driverId?: string;
  customer?: Customer;
  items?: InvoiceItem[];
  payments?: Payment[];
  createdAt: string;
  updatedAt: string;
  pdfUrl?: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  ivaRate: number;
  totalLine: number;
  notes?: string;
  product?: Product;
}

export interface Payment {
  id: string;
  invoiceId: string;
  paymentMethod: 'cash' | 'transfer' | 'posnet' | 'qr_mercado_pago' | 'stripe';
  amount: number;
  currency: string;
  paymentDate: string;
  referenceNumber?: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  externalId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  movementType: 'in' | 'out' | 'adjustment';
  quantity: number;
  unitCost?: number;
  referenceId?: string;
  referenceType?: string;
  driverId?: string;
  notes?: string;
  createdAt: string;
  product?: Product;
  warehouse?: Warehouse;
}

export interface Warehouse {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  isActive: boolean;
}

export interface OCRDocument {
  id: string;
  companyId: string;
  documentType: 'factura' | 'remito' | 'nota_credito' | 'nota_debito';
  s3Url: string;
  extractedData?: any;
  confidenceScore?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processedAt?: string;
  manualReviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SyncQueue {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  priority: number;
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
  timestamp: string;
  nextRetry?: string;
  lastError?: string;
}

// Common types used across the mobile app

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

export interface DriverRoute {
  id: string;
  driverId: string;
  routeDate: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  startTime?: string;
  endTime?: string;
  totalDistance?: number;
  notes?: string;
  visits?: CustomerVisit[];
}

export interface CustomerVisit {
  id: string;
  routeId?: string;
  driverId: string;
  customerId: string;
  visitDate: string;
  arrivalTime?: string;
  departureTime?: string;
  purpose: 'delivery' | 'sale' | 'collection' | 'visit';
  notes?: string;
  gpsLocation?: {
    latitude: number;
    longitude: number;
  };
  customer?: Customer;
}

export interface SyncQueue {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAt: string;
  processedAt?: string;
}

export interface AppSettings {
  afipEnvironment: 'testing' | 'production';
  defaultIvaRate: number;
  autoSyncInterval: number;
  lowStockAlertThreshold: number;
  currency: string;
  timezone: string;
  notifications: {
    enabled: boolean;
    lowStock: boolean;
    payments: boolean;
    syncErrors: boolean;
  };
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

export interface NetworkStatus {
  isConnected: boolean;
  connectionType?: string;
  isInternetReachable?: boolean;
}

export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: any;
  timestamp: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
}

export interface DashboardStats {
  totalInvoices: number;
  totalSales: number;
  pendingPayments: number;
  lowStockProducts: number;
  todayInvoices: number;
  todaySales: number;
  weekInvoices: number;
  weekSales: number;
  monthInvoices: number;
  monthSales: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }[];
}

export interface FormErrors {
  [key: string]: string | undefined;
}

export interface LoadingState {
  isLoading: boolean;
  message?: string;
}

export interface ModalState {
  isVisible: boolean;
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface SearchFilters {
  query?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  invoiceType?: string;
  paymentMethod?: string;
}

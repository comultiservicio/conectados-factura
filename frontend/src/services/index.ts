// Export all services
export { default as api, API_BASE_URL } from './api';
export { authService, loginSchema, registerSchema } from './authService';
export type { LoginInput, RegisterInput, AuthResponse } from './authService';

export { billingService, invoiceSchema } from './billingService';
export type { InvoiceInput, Invoice, CreateInvoiceResponse } from './billingService';

export { stockService, stockMovementSchema, productSchema } from './stockService';
export type {
  StockMovementInput,
  ProductInput,
  Product,
  Warehouse,
  StockMovement,
  CurrentStock,
} from './stockService';

export { paymentsService, paymentSchema } from './paymentsService';
export type { PaymentInput, Payment, PaymentSummary } from './paymentsService';

export { syncService, syncQueueItemSchema } from './syncService';
export type { SyncQueueItemInput, SyncStatus, QueueItem } from './syncService';

export { ocrService, ocrUploadSchema, ocrSearchSchema } from './ocrService';
export type { OcrUploadInput, OcrDocument, SearchResult } from './ocrService';

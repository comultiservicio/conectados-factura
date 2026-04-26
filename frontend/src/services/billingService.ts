import api from './api';
import { z } from 'zod';

// Validation schemas
export const invoiceSchema = z.object({
  customerId: z.string().uuid('ID de cliente inválido'),
  items: z.array(z.object({
    productId: z.string().uuid('ID de producto inválido'),
    quantity: z.number().positive('La cantidad debe ser positiva'),
    unitPrice: z.number().positive('El precio debe ser positivo'),
  })).min(1, 'Debe incluir al menos un ítem'),
  invoiceType: z.enum(['A', 'B', 'C']),
  paymentMethod: z.enum(['cash', 'credit_card', 'debit_card', 'mercado_pago', 'stripe']),
});

export const invoiceItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  invoiceType: 'A' | 'B' | 'C';
  cae: string;
  caeExpirationDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  status: 'draft' | 'issued' | 'cancelled';
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceResponse {
  invoice: Invoice;
  message: string;
}

class BillingService {
  async createInvoice(data: InvoiceInput): Promise<CreateInvoiceResponse> {
    const response = await api.post<CreateInvoiceResponse>('/billing/invoices', data);
    return response.data;
  }

  async getInvoices(params?: {
    customerId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<Invoice[]> {
    const response = await api.get<Invoice[]>('/billing/invoices', { params });
    return response.data;
  }

  async getInvoiceById(invoiceId: string): Promise<Invoice> {
    const response = await api.get<Invoice>(`/billing/invoices/${invoiceId}`);
    return response.data;
  }

  async cancelInvoice(invoiceId: string, reason: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/billing/invoices/${invoiceId}/cancel`, {
      reason,
    });
    return response.data;
  }

  async getInvoicePDF(invoiceId: string): Promise<Blob> {
    const response = await api.get(`/billing/invoices/${invoiceId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async validateAFIPStatus(): Promise<{ status: string; message: string }> {
    const response = await api.get<{ status: string; message: string }>('/billing/afip/status');
    return response.data;
  }
}

export const billingService = new BillingService();
export default billingService;

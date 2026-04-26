import api from './api';
import { z } from 'zod';

// Validation schemas
export const paymentSchema = z.object({
  invoiceId: z.string().uuid('ID de factura inválido'),
  amount: z.number().positive('El monto debe ser positivo'),
  method: z.enum(['cash', 'credit_card', 'debit_card', 'mercado_pago', 'stripe']),
  reference: z.string().optional(),
  gatewayData: z.object({
    token: z.string().optional(),
    paymentMethodId: z.string().optional(),
    installments: z.number().int().positive().optional(),
  }).optional(),
});

export const refundSchema = z.object({
  reason: z.string().min(1, 'El motivo del reembolso es requerido'),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: 'cash' | 'credit_card' | 'debit_card' | 'mercado_pago' | 'stripe';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference?: string;
  gatewayTransactionId?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummary {
  totalAmount: number;
  count: number;
  byMethod: Record<string, { count: number; amount: number }>;
  byStatus: Record<string, { count: number; amount: number }>;
}

export interface ProcessPaymentResponse {
  payment: Payment;
  message: string;
}

class PaymentsService {
  async processPayment(data: PaymentInput): Promise<ProcessPaymentResponse> {
    const response = await api.post<ProcessPaymentResponse>('/payments', data);
    return response.data;
  }

  async getPayments(params?: {
    invoiceId?: string;
    customerId?: string;
    status?: string;
    method?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<Payment[]> {
    const response = await api.get<Payment[]>('/payments', { params });
    return response.data;
  }

  async getPaymentById(paymentId: string): Promise<Payment> {
    const response = await api.get<Payment>(`/payments/${paymentId}`);
    return response.data;
  }

  async refundPayment(paymentId: string, data: RefundInput): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/payments/${paymentId}/refund`, data);
    return response.data;
  }

  async getPaymentSummary(params?: {
    fromDate?: string;
    toDate?: string;
  }): Promise<PaymentSummary> {
    const response = await api.get<PaymentSummary>('/payments/summary', { params });
    return response.data;
  }

  // Gateway specific methods
  async getMercadoPagoPreferences(invoiceId: string): Promise<{
    preferenceId: string;
    initPoint: string;
  }> {
    const response = await api.post<{ preferenceId: string; initPoint: string }>(
      '/payments/mercadopago/preferences',
      { invoiceId }
    );
    return response.data;
  }

  async createStripePaymentIntent(invoiceId: string, amount: number): Promise<{
    clientSecret: string;
  }> {
    const response = await api.post<{ clientSecret: string }>('/payments/stripe/intent', {
      invoiceId,
      amount,
    });
    return response.data;
  }
}

export const paymentsService = new PaymentsService();
export default paymentsService;

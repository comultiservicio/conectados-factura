import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { paymentsService, billingService } from '../services';
import { useAlerts } from '../components';
import './Payments.css';

const paymentSchema = z.object({
  invoiceId: z.string().uuid('Factura inválida'),
  amount: z.number().positive('El monto debe ser positivo'),
  method: z.enum(['cash', 'credit_card', 'debit_card', 'mercado_pago', 'stripe'], {
    required_error: 'Método de pago requerido',
  }),
  reference: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  total: number;
  status: string;
}

interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

const Payments: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'all'>('pending');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<Partial<PaymentFormData>>({
    method: 'cash',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [invoicesData, paymentsData, summaryData] = await Promise.all([
        billingService.getInvoices({ status: 'issued' }),
        paymentsService.getPayments(),
        paymentsService.getPaymentSummary(),
      ]);
      setInvoices(invoicesData);
      setPayments(paymentsData);
      setSummary(summaryData);
    } catch (error) {
      showError('Error al cargar datos de pagos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = paymentSchema.parse(formData);
      await paymentsService.processPayment(validatedData);
      showSuccess('Pago procesado exitosamente');
      setShowPaymentForm(false);
      setFormData({ method: 'cash' });
      loadData();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        showError('Error al procesar pago');
      }
    }
  };

  const getMethodIcon = (method: string) => {
    const icons: Record<string, string> = {
      cash: '💵',
      credit_card: '💳',
      debit_card: '💳',
      mercado_pago: '📱',
      stripe: '💳',
    };
    return icons[method] || '💰';
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      credit_card: 'Tarjeta de Crédito',
      debit_card: 'Tarjeta de Débito',
      mercado_pago: 'Mercado Pago',
      stripe: 'Stripe',
    };
    return labels[method] || method;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      pending: { class: 'badge-pending', label: 'Pendiente' },
      completed: { class: 'badge-completed', label: 'Completado' },
      failed: { class: 'badge-failed', label: 'Fallido' },
      refunded: { class: 'badge-refunded', label: 'Reembolsado' },
    };
    const badge = badges[status] || { class: 'badge-default', label: status };
    return <span className={`status-badge ${badge.class}`}>{badge.label}</span>;
  };

  const filteredPayments = payments.filter(p => {
    if (activeTab === 'pending') return p.status === 'pending';
    if (activeTab === 'completed') return p.status === 'completed';
    return true;
  });

  const pendingInvoices = invoices.filter(i => i.status === 'issued');

  return (
    <div className="payments-page">
      <div className="page-header">
        <h1>Pagos</h1>
        <button
          className="btn-primary"
          onClick={() => setShowPaymentForm(true)}
        >
          + Procesar Pago
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">💰</div>
            <div className="summary-content">
              <span className="summary-label">Total Recaudado</span>
              <span className="summary-value">${summary.totalAmount?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">📊</div>
            <div className="summary-content">
              <span className="summary-label">Total Transacciones</span>
              <span className="summary-value">{summary.count || 0}</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">✅</div>
            <div className="summary-content">
              <span className="summary-label">Completados</span>
              <span className="summary-value">
                {summary.byStatus?.completed?.count || 0}
              </span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">⏳</div>
            <div className="summary-content">
              <span className="summary-label">Pendientes</span>
              <span className="summary-value">
                {summary.byStatus?.pending?.count || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={activeTab === 'pending' ? 'active' : ''}
          onClick={() => setActiveTab('pending')}
        >
          Pendientes ({payments.filter(p => p.status === 'pending').length})
        </button>
        <button
          className={activeTab === 'completed' ? 'active' : ''}
          onClick={() => setActiveTab('completed')}
        >
          Completados ({payments.filter(p => p.status === 'completed').length})
        </button>
        <button
          className={activeTab === 'all' ? 'active' : ''}
          onClick={() => setActiveTab('all')}
        >
          Todos ({payments.length})
        </button>
      </div>

      {/* Payments Table */}
      <div className="payments-table-container">
        <table className="data-table payments-table">
          <thead>
            <tr>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Método</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map(payment => (
              <tr key={payment.id}>
                <td>{payment.invoiceNumber}</td>
                <td>{payment.customerName}</td>
                <td>
                  <span className="method-cell">
                    <span className="method-icon">{getMethodIcon(payment.method)}</span>
                    <span className="method-name">{getMethodLabel(payment.method)}</span>
                  </span>
                </td>
                <td className="amount-cell">${payment.amount?.toFixed(2)}</td>
                <td>{getStatusBadge(payment.status)}</td>
                <td>{new Date(payment.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className="btn-small">Ver</button>
                  {payment.status === 'completed' && (
                    <button className="btn-small btn-secondary">Reembolsar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <h2>Procesar Pago</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Factura *</label>
                <select
                  value={formData.invoiceId || ''}
                  onChange={e => {
                    const invoice = pendingInvoices.find(i => i.id === e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      invoiceId: e.target.value,
                      amount: invoice?.total,
                    }));
                  }}
                  aria-label="Seleccionar factura"
                >
                  <option value="">Seleccionar factura...</option>
                  {pendingInvoices.map(invoice => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - {invoice.customerName} (${invoice.total.toFixed(2)})
                    </option>
                  ))}
                </select>
                {errors.invoiceId && <span className="error">{errors.invoiceId}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount || ''}
                    onChange={e => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                    aria-label="Monto del pago"
                    placeholder="0.00"
                  />
                  {errors.amount && <span className="error">{errors.amount}</span>}
                </div>
                <div className="form-group">
                  <label>Método de Pago *</label>
                  <select
                    value={formData.method}
                    onChange={e => setFormData(prev => ({ ...prev, method: e.target.value as any }))}
                    aria-label="Método de pago"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="credit_card">Tarjeta de Crédito</option>
                    <option value="debit_card">Tarjeta de Débito</option>
                    <option value="mercado_pago">Mercado Pago</option>
                    <option value="stripe">Stripe</option>
                  </select>
                  {errors.method && <span className="error">{errors.method}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Referencia (opcional)</label>
                <input
                  type="text"
                  value={formData.reference || ''}
                  onChange={e => setFormData(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="Número de transacción, código de referencia, etc."
                  aria-label="Referencia del pago"
                />
              </div>

              {/* Payment Method Info */}
              <div className="payment-info">
                {formData.method === 'mercado_pago' && (
                  <div className="info-box">
                    <strong>💳 Mercado Pago</strong>
                    <p>El cliente será redirigido a Mercado Pago para completar el pago.</p>
                  </div>
                )}
                {formData.method === 'stripe' && (
                  <div className="info-box">
                    <strong>💳 Stripe</strong>
                    <p>Se abrirá el formulario de pago seguro de Stripe.</p>
                  </div>
                )}
                {formData.method === 'cash' && (
                  <div className="info-box">
                    <strong>💵 Efectivo</strong>
                    <p>Registro de pago en efectivo. Asegúrese de contar el dinero recibido.</p>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowPaymentForm(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={isLoading}>
                  {isLoading ? 'Procesando...' : 'Procesar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;

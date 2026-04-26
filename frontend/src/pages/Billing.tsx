import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { billingService, stockService } from '../services';
import { useAlerts } from '../components';
import './Billing.css';

const invoiceItemSchema = z.object({
  productId: z.string().uuid('Producto inválido'),
  productName: z.string().min(1, 'Nombre requerido'),
  quantity: z.number().positive('Cantidad debe ser positiva'),
  unitPrice: z.number().positive('Precio debe ser positivo'),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid('Cliente inválido'),
  customerName: z.string().min(2, 'Nombre del cliente requerido'),
  customerCuit: z.string().regex(/^\d{2}-\d{8}-\d$/, 'CUIT inválido (##-########-#)'),
  customerAddress: z.string().min(5, 'Dirección requerida'),
  invoiceType: z.enum(['A', 'B', 'C'], { required_error: 'Tipo de factura requerido' }),
  paymentMethod: z.enum(['cash', 'credit_card', 'debit_card', 'mercado_pago', 'stripe'], {
    required_error: 'Método de pago requerido',
  }),
  items: z.array(invoiceItemSchema).min(1, 'Debe incluir al menos un ítem'),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
}

const Billing: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState<Partial<InvoiceFormData>>({
    invoiceType: 'B',
    paymentMethod: 'cash',
    items: [],
  });

  const [currentItem, setCurrentItem] = useState({
    productId: '',
    quantity: 1,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [productsData, invoicesData] = await Promise.all([
        stockService.getProducts(),
        billingService.getInvoices(),
      ]);
      setProducts(productsData);
      setInvoices(invoicesData);
    } catch (error) {
      showError('Error al cargar datos');
    }
  };

  const addItem = () => {
    const product = products.find(p => p.id === currentItem.productId);
    if (!product) return;

    const newItem = {
      productId: product.id,
      productName: product.name,
      quantity: currentItem.quantity,
      unitPrice: product.price,
    };

    setFormData(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem],
    }));

    setCurrentItem({ productId: '', quantity: 1 });
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.filter((_, i) => i !== index),
    }));
  };

  const calculateTotals = () => {
    const items = formData.items || [];
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * 0.21; // 21% IVA
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      const validatedData = invoiceSchema.parse(formData);
      await billingService.createInvoice(validatedData);
      showSuccess('Factura creada exitosamente');
      setShowForm(false);
      setFormData({
        invoiceType: 'B',
        paymentMethod: 'cash',
        items: [],
      });
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
        showError('Error al crear factura');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      draft: { class: 'badge-draft', label: 'Borrador' },
      issued: { class: 'badge-issued', label: 'Emitida' },
      cancelled: { class: 'badge-cancelled', label: 'Anulada' },
    };
    const badge = badges[status] || { class: 'badge-default', label: status };
    return <span className={`status-badge ${badge.class}`}>{badge.label}</span>;
  };

  return (
    <div className="billing-page">
      <div className="page-header">
        <h1>Facturación AFIP</h1>
        <button
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Ver Listado' : '+ Nueva Factura'}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="invoice-form">
          <div className="form-section">
            <h3>Datos del Cliente</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Nombre *</label>
                <input
                  type="text"
                  value={formData.customerName || ''}
                  onChange={e => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Nombre del cliente"
                />
                {errors.customerName && <span className="error">{errors.customerName}</span>}
              </div>
              <div className="form-group">
                <label>CUIT *</label>
                <input
                  type="text"
                  value={formData.customerCuit || ''}
                  onChange={e => setFormData(prev => ({ ...prev, customerCuit: e.target.value }))}
                  placeholder="##-########-#"
                />
                {errors.customerCuit && <span className="error">{errors.customerCuit}</span>}
              </div>
            </div>
            <div className="form-group">
              <label>Dirección *</label>
              <input
                type="text"
                value={formData.customerAddress || ''}
                onChange={e => setFormData(prev => ({ ...prev, customerAddress: e.target.value }))}
                placeholder="Dirección completa"
              />
              {errors.customerAddress && <span className="error">{errors.customerAddress}</span>}
            </div>
          </div>

          <div className="form-section">
            <h3>Datos de la Factura</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo de Factura *</label>
                <select
                  value={formData.invoiceType}
                  onChange={e => setFormData(prev => ({ ...prev, invoiceType: e.target.value as 'A' | 'B' | 'C' }))}
                  aria-label="Tipo de factura"
                >
                  <option value="A">Factura A</option>
                  <option value="B">Factura B</option>
                  <option value="C">Factura C</option>
                </select>
              </div>
              <div className="form-group">
                <label>Método de Pago *</label>
                <select
                  value={formData.paymentMethod}
                  onChange={e => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                  aria-label="Método de pago"
                >
                  <option value="cash">Efectivo</option>
                  <option value="credit_card">Tarjeta de Crédito</option>
                  <option value="debit_card">Tarjeta de Débito</option>
                  <option value="mercado_pago">Mercado Pago</option>
                  <option value="stripe">Stripe</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Ítems</h3>
            <div className="item-add-row">
              <select
                value={currentItem.productId}
                onChange={e => setCurrentItem(prev => ({ ...prev, productId: e.target.value }))}
                aria-label="Seleccionar producto"
              >
                <option value="">Seleccionar producto</option>
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name} - ${product.price}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={currentItem.quantity}
                onChange={e => setCurrentItem(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                placeholder="Cantidad"
              />
              <button type="button" onClick={addItem} className="btn-secondary">
                Agregar
              </button>
            </div>

            {formData.items && formData.items.length > 0 && (
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio Unit.</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>${item.unitPrice.toFixed(2)}</td>
                      <td>${(item.quantity * item.unitPrice).toFixed(2)}</td>
                      <td>
                        <button type="button" onClick={() => removeItem(index)} className="btn-delete">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {errors.items && <span className="error">{errors.items}</span>}
          </div>

          <div className="form-section totals">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>${calculateTotals().subtotal.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>IVA (21%):</span>
              <span>${calculateTotals().taxAmount.toFixed(2)}</span>
            </div>
            <div className="total-row grand-total">
              <span>Total:</span>
              <span>${calculateTotals().total.toFixed(2)}</span>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Creando...' : 'Crear Factura'}
            </button>
          </div>
        </form>
      ) : (
        <div className="invoices-list">
          <table className="data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.invoiceType}</td>
                  <td>{invoice.customerName}</td>
                  <td>{new Date(invoice.createdAt).toLocaleDateString()}</td>
                  <td>${invoice.total?.toFixed(2)}</td>
                  <td>{getStatusBadge(invoice.status)}</td>
                  <td>
                    <button className="btn-small">Ver</button>
                    {invoice.status === 'draft' && (
                      <button className="btn-small btn-danger">Anular</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Billing;

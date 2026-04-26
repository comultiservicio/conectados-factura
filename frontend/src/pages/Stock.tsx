import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { stockService } from '../services';
import { useAlerts } from '../components';
import './Stock.css';

const productSchema = z.object({
  name: z.string().min(2, 'Nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
  price: z.number().positive('El precio debe ser positivo'),
  sku: z.string().min(1, 'SKU es requerido'),
  minStock: z.number().int().positive('Stock mínimo debe ser positivo'),
});

const movementSchema = z.object({
  productId: z.string().uuid('Producto inválido'),
  warehouseId: z.string().uuid('Almacén inválido'),
  type: z.enum(['in', 'out']),
  quantity: z.number().positive('Cantidad debe ser positiva'),
  reason: z.string().min(3, 'Motivo requerido (mínimo 3 caracteres)'),
});

type ProductFormData = z.infer<typeof productSchema>;
type MovementFormData = z.infer<typeof movementSchema>;

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  sku: string;
  minStock: number;
}

interface Warehouse {
  id: string;
  name: string;
  address?: string;
}

interface CurrentStock {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  minStock: number;
  isLow: boolean;
}

const Stock: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [activeTab, setActiveTab] = useState<'inventory' | 'products' | 'movements'>('inventory');
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [currentStock, setCurrentStock] = useState<CurrentStock[]>([]);
  const [lowStock, setLowStock] = useState<CurrentStock[]>([]);
  const [, setIsLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [productForm, setProductForm] = useState<Partial<ProductFormData>>({
    minStock: 10,
  });

  const [movementForm, setMovementForm] = useState<Partial<MovementFormData>>({
    type: 'in',
    quantity: 1,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [productsData, warehousesData, stockData, lowStockData] = await Promise.all([
        stockService.getProducts(),
        stockService.getWarehouses(),
        stockService.getCurrentStock(),
        stockService.getLowStockAlerts(),
      ]);
      setProducts(productsData);
      setWarehouses(warehousesData);
      setCurrentStock(stockData);
      setLowStock(lowStockData);
    } catch (error) {
      showError('Error al cargar datos de stock');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = productSchema.parse(productForm);
      await stockService.createProduct(validatedData);
      showSuccess('Producto creado exitosamente');
      setShowProductForm(false);
      setProductForm({ minStock: 10 });
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
        showError('Error al crear producto');
      }
    }
  };

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = movementSchema.parse(movementForm);
      await stockService.createMovement(validatedData);
      showSuccess('Movimiento registrado exitosamente');
      setShowMovementForm(false);
      setMovementForm({ type: 'in', quantity: 1 });
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
        showError('Error al registrar movimiento');
      }
    }
  };

  return (
    <div className="stock-page">
      <div className="page-header">
        <h1>Gestión de Stock</h1>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowMovementForm(true)}
          >
            + Movimiento
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowProductForm(true)}
          >
            + Producto
          </button>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div className="alerts-section">
          <h3>⚠️ Alertas de Stock Bajo</h3>
          <div className="alerts-grid">
            {lowStock.map(item => (
              <div key={`${item.productId}-${item.warehouseId}`} className="alert-card">
                <div className="alert-content">
                  <strong>{item.productName}</strong>
                  <span>{item.warehouseName}</span>
                </div>
                <div className="alert-quantity">
                  <span className="current">{item.quantity}</span>
                  <span className="minimum">/ min: {item.minStock}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={activeTab === 'inventory' ? 'active' : ''}
          onClick={() => setActiveTab('inventory')}
        >
          Inventario Actual
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          Productos
        </button>
        <button
          className={activeTab === 'movements' ? 'active' : ''}
          onClick={() => setActiveTab('movements')}
        >
          Movimientos
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'inventory' && (
          <div className="inventory-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Almacén</th>
                  <th>Cantidad</th>
                  <th>Mínimo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {currentStock.map(item => (
                  <tr key={`${item.productId}-${item.warehouseId}`} className={item.isLow ? 'low-stock' : ''}>
                    <td>{item.productName}</td>
                    <td>{item.warehouseName}</td>
                    <td>{item.quantity}</td>
                    <td>{item.minStock}</td>
                    <td>
                      {item.isLow ? (
                        <span className="badge-warning">Stock Bajo</span>
                      ) : (
                        <span className="badge-success">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="products-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Precio</th>
                  <th>Stock Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {products.map(product => (
                  <tr key={product.id}>
                    <td><code>{product.sku}</code></td>
                    <td>{product.name}</td>
                    <td>{product.description || '-'}</td>
                    <td>${product.price.toFixed(2)}</td>
                    <td>{product.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'movements' && (
          <div className="movements-info">
            <p>Los movimientos de stock se registran automáticamente al:</p>
            <ul>
              <li>Crear facturas (salida de stock)</li>
              <li>Procesar devoluciones (entrada de stock)</li>
              <li>Ajustes manuales de inventario</li>
            </ul>
            <button className="btn-secondary" onClick={() => setShowMovementForm(true)}>
              Registrar Movimiento Manual
            </button>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      {showProductForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Nuevo Producto</h2>
            <form onSubmit={handleCreateProduct}>
              <div className="form-group">
                <label>Nombre *</label>
                <input
                  type="text"
                  value={productForm.name || ''}
                  onChange={e => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  aria-label="Nombre del producto"
                  placeholder="Nombre del producto"
                />
                {errors.name && <span className="error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input
                  type="text"
                  value={productForm.description || ''}
                  onChange={e => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                  aria-label="Descripción del producto"
                  placeholder="Descripción opcional"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>SKU *</label>
                  <input
                    type="text"
                    value={productForm.sku || ''}
                    onChange={e => setProductForm(prev => ({ ...prev, sku: e.target.value }))}
                    aria-label="SKU del producto"
                    placeholder="Código SKU"
                  />
                  {errors.sku && <span className="error">{errors.sku}</span>}
                </div>
                <div className="form-group">
                  <label>Precio *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.price || ''}
                    onChange={e => setProductForm(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                    aria-label="Precio del producto"
                    placeholder="0.00"
                  />
                  {errors.price && <span className="error">{errors.price}</span>}
                </div>
              </div>
              <div className="form-group">
                <label>Stock Mínimo *</label>
                <input
                  type="number"
                  value={productForm.minStock || 10}
                  onChange={e => setProductForm(prev => ({ ...prev, minStock: parseInt(e.target.value) }))}
                  aria-label="Stock mínimo"
                  placeholder="10"
                />
                {errors.minStock && <span className="error">{errors.minStock}</span>}
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowProductForm(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement Form Modal */}
      {showMovementForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Registrar Movimiento</h2>
            <form onSubmit={handleCreateMovement}>
              <div className="form-group">
                <label>Producto *</label>
                <select
                  value={movementForm.productId || ''}
                  onChange={e => setMovementForm(prev => ({ ...prev, productId: e.target.value }))}
                  aria-label="Seleccionar producto"
                >
                  <option value="">Seleccionar...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
                {errors.productId && <span className="error">{errors.productId}</span>}
              </div>
              <div className="form-group">
                <label>Almacén *</label>
                <select
                  value={movementForm.warehouseId || ''}
                  onChange={e => setMovementForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                  aria-label="Seleccionar almacén"
                >
                  <option value="">Seleccionar...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {errors.warehouseId && <span className="error">{errors.warehouseId}</span>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tipo *</label>
                  <select
                    value={movementForm.type}
                    onChange={e => setMovementForm(prev => ({ ...prev, type: e.target.value as 'in' | 'out' }))}
                    aria-label="Tipo de movimiento"
                  >
                    <option value="in">Entrada</option>
                    <option value="out">Salida</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Cantidad *</label>
                  <input
                    type="number"
                    min="1"
                    value={movementForm.quantity || 1}
                    onChange={e => setMovementForm(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
                    aria-label="Cantidad"
                    placeholder="1"
                  />
                  {errors.quantity && <span className="error">{errors.quantity}</span>}
                </div>
              </div>
              <div className="form-group">
                <label>Motivo *</label>
                <input
                  type="text"
                  value={movementForm.reason || ''}
                  onChange={e => setMovementForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ej: Ajuste de inventario, Devolución, etc."
                />
                {errors.reason && <span className="error">{errors.reason}</span>}
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowMovementForm(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stock;

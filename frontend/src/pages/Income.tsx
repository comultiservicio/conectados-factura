import React, { useState, useMemo } from 'react';
import { z } from 'zod';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { Plus, TrendingUp, DollarSign, Calendar, Filter } from 'lucide-react';
import { StatCard, ChartContainer } from '../components/ui';
import { useAlerts } from '../components';
import './Income.css';

const incomeSchema = z.object({
  description: z.string().min(1, 'Descripción requerida'),
  amount: z.number().positive('El monto debe ser positivo'),
  category: z.enum(['sales', 'service', 'other']),
  date: z.string().min(1, 'Fecha requerida'),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'mercado_pago']),
  notes: z.string().optional(),
});

type IncomeFormData = z.infer<typeof incomeSchema>;

interface Income {
  id: string;
  description: string;
  amount: number;
  category: 'sales' | 'service' | 'other';
  date: string;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'mercado_pago';
  notes?: string;
}

const mockData: Income[] = [
  { id: '1', description: 'Venta Producto A', amount: 15000, category: 'sales', date: '2026-04-01', paymentMethod: 'cash' },
  { id: '2', description: 'Servicio Técnico', amount: 8500, category: 'service', date: '2026-04-02', paymentMethod: 'card' },
  { id: '3', description: 'Venta Producto B', amount: 23000, category: 'sales', date: '2026-04-03', paymentMethod: 'mercado_pago' },
  { id: '4', description: 'Consultoría', amount: 12000, category: 'service', date: '2026-04-05', paymentMethod: 'transfer' },
  { id: '5', description: 'Venta Producto C', amount: 18700, category: 'sales', date: '2026-04-07', paymentMethod: 'cash' },
  { id: '6', description: 'Servicio Mantenimiento', amount: 5600, category: 'service', date: '2026-04-08', paymentMethod: 'card' },
  { id: '7', description: 'Venta Producto D', amount: 31000, category: 'sales', date: '2026-04-10', paymentMethod: 'mercado_pago' },
  { id: '8', description: 'Otro ingreso', amount: 4200, category: 'other', date: '2026-04-12', paymentMethod: 'cash' },
];

const Income: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [incomes, setIncomes] = useState<Income[]>(mockData);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState<Partial<IncomeFormData>>({
    date: new Date().toISOString().split('T')[0],
    category: 'sales',
    paymentMethod: 'cash',
  });

  const stats = useMemo(() => {
    const total = incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const daily = incomes
      .filter(inc => inc.date === new Date().toISOString().split('T')[0])
      .reduce((sum, inc) => sum + inc.amount, 0);
    const monthly = total; // Simplified for demo
    const byCategory = {
      sales: incomes.filter(i => i.category === 'sales').reduce((sum, i) => sum + i.amount, 0),
      service: incomes.filter(i => i.category === 'service').reduce((sum, i) => sum + i.amount, 0),
      other: incomes.filter(i => i.category === 'other').reduce((sum, i) => sum + i.amount, 0),
    };
    return { total, daily, monthly, byCategory };
  }, [incomes]);

  const chartData = useMemo(() => {
    const grouped = incomes.reduce((acc, inc) => {
      const date = inc.date.slice(0, 10);
      acc[date] = (acc[date] || 0) + inc.amount;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [incomes]);

  const categoryData = useMemo(() => [
    { name: 'Ventas', value: stats.byCategory.sales, fill: '#3b82f6' },
    { name: 'Servicios', value: stats.byCategory.service, fill: '#10b981' },
    { name: 'Otros', value: stats.byCategory.other, fill: '#f59e0b' },
  ], [stats]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validated = incomeSchema.parse({
        ...formData,
        amount: Number(formData.amount),
      });
      
      const newIncome: Income = {
        ...validated,
        id: Date.now().toString(),
      };
      
      setIncomes(prev => [newIncome, ...prev]);
      setShowForm(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: 'sales',
        paymentMethod: 'cash',
      });
      setErrors({});
      showSuccess('Ingreso registrado correctamente');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          fieldErrors[err.path[0]] = err.message;
        });
        setErrors(fieldErrors);
      } else {
        showError('Error al registrar ingreso');
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  return (
    <div className="income-page">
      <div className="page-header">
        <h1>Ingresos</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={20} />
          Nuevo Ingreso
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatCard
          title="Total Ingresos"
          value={formatCurrency(stats.total)}
          subtitle="Acumulado del período"
          icon={<DollarSign size={24} />}
          color="success"
          trend="up"
          trendValue="12%"
        />
        <StatCard
          title="Ingresos Hoy"
          value={formatCurrency(stats.daily)}
          subtitle={new Date().toLocaleDateString('es-AR')}
          icon={<Calendar size={24} />}
          color="primary"
        />
        <StatCard
          title="Ventas"
          value={formatCurrency(stats.byCategory.sales)}
          subtitle="Categoría principal"
          icon={<TrendingUp size={24} />}
          color="info"
        />
        <StatCard
          title="Transacciones"
          value={incomes.length}
          subtitle="Cantidad total"
          icon={<Filter size={24} />}
          color="warning"
        />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <ChartContainer 
          title="Evolución de Ingresos" 
          subtitle="Ingresos por día"
          className="chart-full-width"
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(date) => new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                stroke="#6b7280"
              />
              <YAxis 
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                stroke="#6b7280"
              />
              <Tooltip 
                formatter={(value: any) => formatCurrency(Number(value) || 0)}
                labelFormatter={(label) => new Date(label).toLocaleDateString('es-AR')}
              />
              <Area 
                type="monotone" 
                dataKey="amount" 
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorIncome)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Ingresos por Categoría">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="#6b7280" />
              <YAxis type="category" dataKey="name" stroke="#6b7280" width={80} />
              <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Métodos de Pago">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[
              { name: 'Efectivo', value: incomes.filter(i => i.paymentMethod === 'cash').reduce((s, i) => s + i.amount, 0) },
              { name: 'Tarjeta', value: incomes.filter(i => i.paymentMethod === 'card').reduce((s, i) => s + i.amount, 0) },
              { name: 'Transferencia', value: incomes.filter(i => i.paymentMethod === 'transfer').reduce((s, i) => s + i.amount, 0) },
              { name: 'MP', value: incomes.filter(i => i.paymentMethod === 'mercado_pago').reduce((s, i) => s + i.amount, 0) },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="#6b7280" />
              <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Income List */}
      <div className="income-list-container">
        <h2>Últimos Ingresos</h2>
        <div className="income-table-wrapper">
          <table className="income-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Método</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {incomes.slice(0, 10).map(income => (
                <tr key={income.id}>
                  <td>{new Date(income.date).toLocaleDateString('es-AR')}</td>
                  <td>{income.description}</td>
                  <td>
                    <span className={`category-badge category-${income.category}`}>
                      {income.category === 'sales' && 'Venta'}
                      {income.category === 'service' && 'Servicio'}
                      {income.category === 'other' && 'Otro'}
                    </span>
                  </td>
                  <td>
                    <span className={`payment-badge payment-${income.paymentMethod}`}>
                      {income.paymentMethod === 'cash' && 'Efectivo'}
                      {income.paymentMethod === 'card' && 'Tarjeta'}
                      {income.paymentMethod === 'transfer' && 'Transferencia'}
                      {income.paymentMethod === 'mercado_pago' && 'Mercado Pago'}
                    </span>
                  </td>
                  <td className="amount-cell">{formatCurrency(income.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Nuevo Ingreso</h2>
            <form onSubmit={handleSubmit} className="income-form">
              <div className="form-group">
                <label htmlFor="description">Descripción</label>
                <input
                  id="description"
                  type="text"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Venta Producto X"
                  aria-label="Descripción del ingreso"
                />
                {errors.description && <span className="error">{errors.description}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="amount">Monto</label>
                  <input
                    id="amount"
                    type="number"
                    value={formData.amount || ''}
                    onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                    placeholder="0.00"
                    step="0.01"
                    aria-label="Monto del ingreso"
                  />
                  {errors.amount && <span className="error">{errors.amount}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="date">Fecha</label>
                  <input
                    id="date"
                    type="date"
                    value={formData.date || ''}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    aria-label="Fecha del ingreso"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="category">Categoría</label>
                  <select
                    id="category"
                    value={formData.category || 'sales'}
                    onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                    aria-label="Categoría del ingreso"
                  >
                    <option value="sales">Venta</option>
                    <option value="service">Servicio</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="paymentMethod">Método de Pago</label>
                  <select
                    id="paymentMethod"
                    value={formData.paymentMethod || 'cash'}
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                    aria-label="Método de pago"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                    <option value="mercado_pago">Mercado Pago</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notas (opcional)</label>
                <textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={3}
                  aria-label="Notas adicionales"
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Guardar Ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Income;

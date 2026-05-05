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
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { Plus, TrendingDown, DollarSign, Calendar, Filter } from 'lucide-react';
import { StatCard, ChartContainer } from '../components/ui';
import { useAlerts } from '../components';
import './Expenses.css';

const expenseSchema = z.object({
  description: z.string().min(1, 'Descripción requerida'),
  amount: z.number().positive('El monto debe ser positivo'),
  category: z.enum(['supplies', 'salary', 'services', 'taxes', 'other']),
  date: z.string().min(1, 'Fecha requerida'),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'debit']),
  notes: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: 'supplies' | 'salary' | 'services' | 'taxes' | 'other';
  date: string;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'debit';
  notes?: string;
}

const mockData: Expense[] = [
  { id: '1', description: 'Compra de insumos', amount: 8500, category: 'supplies', date: '2026-04-01', paymentMethod: 'card' },
  { id: '2', description: 'Sueldo Empleado 1', amount: 120000, category: 'salary', date: '2026-04-01', paymentMethod: 'transfer' },
  { id: '3', description: 'Servicio de luz', amount: 4500, category: 'services', date: '2026-04-05', paymentMethod: 'debit' },
  { id: '4', description: 'Impuestos municipales', amount: 8500, category: 'taxes', date: '2026-04-10', paymentMethod: 'transfer' },
  { id: '5', description: 'Compra de papel', amount: 2300, category: 'supplies', date: '2026-04-12', paymentMethod: 'cash' },
  { id: '6', description: 'Sueldo Empleado 2', amount: 95000, category: 'salary', date: '2026-04-15', paymentMethod: 'transfer' },
  { id: '7', description: 'Servicio de internet', amount: 3200, category: 'services', date: '2026-04-15', paymentMethod: 'debit' },
  { id: '8', description: 'Mantenimiento equipo', amount: 15000, category: 'other', date: '2026-04-18', paymentMethod: 'card' },
];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981'];

const Expenses: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [expenses, setExpenses] = useState<Expense[]>(mockData);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState<Partial<ExpenseFormData>>({
    date: new Date().toISOString().split('T')[0],
    category: 'supplies',
    paymentMethod: 'card',
  });

  const stats = useMemo(() => {
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const daily = expenses
      .filter(exp => exp.date === new Date().toISOString().split('T')[0])
      .reduce((sum, exp) => sum + exp.amount, 0);
    const monthly = total;
    const byCategory = {
      supplies: expenses.filter(i => i.category === 'supplies').reduce((sum, i) => sum + i.amount, 0),
      salary: expenses.filter(i => i.category === 'salary').reduce((sum, i) => sum + i.amount, 0),
      services: expenses.filter(i => i.category === 'services').reduce((sum, i) => sum + i.amount, 0),
      taxes: expenses.filter(i => i.category === 'taxes').reduce((sum, i) => sum + i.amount, 0),
      other: expenses.filter(i => i.category === 'other').reduce((sum, i) => sum + i.amount, 0),
    };
    return { total, daily, monthly, byCategory };
  }, [expenses]);

  const chartData = useMemo(() => {
    const grouped = expenses.reduce((acc, exp) => {
      const date = exp.date.slice(0, 10);
      acc[date] = (acc[date] || 0) + exp.amount;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [expenses]);

  const categoryData = useMemo(() => [
    { name: 'Insumos', value: stats.byCategory.supplies },
    { name: 'Sueldos', value: stats.byCategory.salary },
    { name: 'Servicios', value: stats.byCategory.services },
    { name: 'Impuestos', value: stats.byCategory.taxes },
    { name: 'Otros', value: stats.byCategory.other },
  ], [stats]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validated = expenseSchema.parse({
        ...formData,
        amount: Number(formData.amount),
      });
      
      const newExpense: Expense = {
        ...validated,
        id: Date.now().toString(),
      };
      
      setExpenses(prev => [newExpense, ...prev]);
      setShowForm(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: 'supplies',
        paymentMethod: 'card',
      });
      setErrors({});
      showSuccess('Egreso registrado correctamente');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          fieldErrors[err.path[0]] = err.message;
        });
        setErrors(fieldErrors);
      } else {
        showError('Error al registrar egreso');
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
    <div className="expenses-page">
      <div className="page-header">
        <h1>Egresos</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={20} />
          Nuevo Egreso
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatCard
          title="Total Egresos"
          value={formatCurrency(stats.total)}
          subtitle="Acumulado del período"
          icon={<DollarSign size={24} />}
          color="danger"
          trend="up"
          trendValue="8%"
        />
        <StatCard
          title="Egresos Hoy"
          value={formatCurrency(stats.daily)}
          subtitle={new Date().toLocaleDateString('es-AR')}
          icon={<Calendar size={24} />}
          color="warning"
        />
        <StatCard
          title="Sueldos"
          value={formatCurrency(stats.byCategory.salary)}
          subtitle="Mayor categoría"
          icon={<TrendingDown size={24} />}
          color="danger"
        />
        <StatCard
          title="Transacciones"
          value={expenses.length}
          subtitle="Cantidad total"
          icon={<Filter size={24} />}
          color="info"
        />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <ChartContainer 
          title="Evolución de Egresos" 
          subtitle="Egresos por día"
          className="chart-full-width"
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
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
                stroke="#ef4444" 
                fillOpacity={1} 
                fill="url(#colorExpense)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Egresos por Categoría">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {categoryData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-legend">
            {categoryData.map((item, index) => (
              <div key={item.name} className="legend-item">
                <span className="legend-color" style={{ backgroundColor: COLORS[index] }}></span>
                <span className="legend-label">{item.name}</span>
              </div>
            ))}
          </div>
        </ChartContainer>

        <ChartContainer title="Métodos de Pago">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[
              { name: 'Efectivo', value: expenses.filter(i => i.paymentMethod === 'cash').reduce((s, i) => s + i.amount, 0) },
              { name: 'Tarjeta', value: expenses.filter(i => i.paymentMethod === 'card').reduce((s, i) => s + i.amount, 0) },
              { name: 'Transferencia', value: expenses.filter(i => i.paymentMethod === 'transfer').reduce((s, i) => s + i.amount, 0) },
              { name: 'Débito', value: expenses.filter(i => i.paymentMethod === 'debit').reduce((s, i) => s + i.amount, 0) },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="#6b7280" />
              <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Expenses List */}
      <div className="expenses-list-container">
        <h2>Últimos Egresos</h2>
        <div className="expenses-table-wrapper">
          <table className="expenses-table">
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
              {expenses.slice(0, 10).map(expense => (
                <tr key={expense.id}>
                  <td>{new Date(expense.date).toLocaleDateString('es-AR')}</td>
                  <td>{expense.description}</td>
                  <td>
                    <span className={`expense-category-badge category-${expense.category}`}>
                      {expense.category === 'supplies' && 'Insumos'}
                      {expense.category === 'salary' && 'Sueldos'}
                      {expense.category === 'services' && 'Servicios'}
                      {expense.category === 'taxes' && 'Impuestos'}
                      {expense.category === 'other' && 'Otros'}
                    </span>
                  </td>
                  <td>
                    <span className={`expense-payment-badge payment-${expense.paymentMethod}`}>
                      {expense.paymentMethod === 'cash' && 'Efectivo'}
                      {expense.paymentMethod === 'card' && 'Tarjeta'}
                      {expense.paymentMethod === 'transfer' && 'Transferencia'}
                      {expense.paymentMethod === 'debit' && 'Débito'}
                    </span>
                  </td>
                  <td className="expense-amount-cell">{formatCurrency(expense.amount)}</td>
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
            <h2>Nuevo Egreso</h2>
            <form onSubmit={handleSubmit} className="expense-form">
              <div className="form-group">
                <label htmlFor="description">Descripción</label>
                <input
                  id="description"
                  type="text"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Compra de insumos"
                  aria-label="Descripción del egreso"
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
                    aria-label="Monto del egreso"
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
                    aria-label="Fecha del egreso"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="category">Categoría</label>
                  <select
                    id="category"
                    value={formData.category || 'supplies'}
                    onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                    aria-label="Categoría del egreso"
                  >
                    <option value="supplies">Insumos</option>
                    <option value="salary">Sueldos</option>
                    <option value="services">Servicios</option>
                    <option value="taxes">Impuestos</option>
                    <option value="other">Otros</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="paymentMethod">Método de Pago</label>
                  <select
                    id="paymentMethod"
                    value={formData.paymentMethod || 'card'}
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                    aria-label="Método de pago"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                    <option value="debit">Débito Automático</option>
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
                  Guardar Egreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;

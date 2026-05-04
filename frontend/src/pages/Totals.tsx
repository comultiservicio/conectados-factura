import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Calendar, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { StatCard, ChartContainer, Table } from '../components/ui';
import { useAlerts } from '../components';
import './Totals.css';

// Mock data - in real app this would come from API
const mockIncomeData = [
  { id: '1', description: 'Venta Producto A', amount: 15000, date: '2026-04-01', category: 'sales' },
  { id: '2', description: 'Servicio Técnico', amount: 8500, date: '2026-04-02', category: 'service' },
  { id: '3', description: 'Venta Producto B', amount: 23000, date: '2026-04-03', category: 'sales' },
  { id: '4', description: 'Consultoría', amount: 12000, date: '2026-04-05', category: 'service' },
  { id: '5', description: 'Venta Producto C', amount: 18700, date: '2026-04-07', category: 'sales' },
  { id: '6', description: 'Venta Producto D', amount: 31000, date: '2026-04-10', category: 'sales' },
  { id: '7', description: 'Otro ingreso', amount: 4200, date: '2026-04-12', category: 'other' },
  { id: '8', description: 'Venta Producto E', amount: 28000, date: '2026-04-15', category: 'sales' },
  { id: '9', description: 'Servicio Especial', amount: 15000, date: '2026-04-18', category: 'service' },
  { id: '10', description: 'Venta Producto F', amount: 22000, date: '2026-04-20', category: 'sales' },
];

const mockExpenseData = [
  { id: '1', description: 'Compra de insumos', amount: 8500, date: '2026-04-01', category: 'supplies' },
  { id: '2', description: 'Sueldo Empleado 1', amount: 120000, date: '2026-04-01', category: 'salary' },
  { id: '3', description: 'Servicio de luz', amount: 4500, date: '2026-04-05', category: 'services' },
  { id: '4', description: 'Impuestos municipales', amount: 8500, date: '2026-04-10', category: 'taxes' },
  { id: '5', description: 'Compra de papel', amount: 2300, date: '2026-04-12', category: 'supplies' },
  { id: '6', description: 'Sueldo Empleado 2', amount: 95000, date: '2026-04-15', category: 'salary' },
  { id: '7', description: 'Servicio de internet', amount: 3200, date: '2026-04-15', category: 'services' },
  { id: '8', description: 'Mantenimiento equipo', amount: 15000, date: '2026-04-18', category: 'other' },
  { id: '9', description: 'Alquiler local', amount: 45000, date: '2026-04-20', category: 'services' },
];

type PeriodFilter = 'day' | 'week' | 'month' | 'quarter' | 'year';

const Totals: React.FC = () => {
  const { showSuccess } = useAlerts();
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const stats = useMemo(() => {
    const totalIncome = mockIncomeData.reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpenses = mockExpenseData.reduce((sum, exp) => sum + exp.amount, 0);
    const netBalance = totalIncome - totalExpenses;
    
    // Daily calculations
    const today = selectedDate;
    const dailyIncome = mockIncomeData
      .filter(inc => inc.date === today)
      .reduce((sum, inc) => sum + inc.amount, 0);
    const dailyExpenses = mockExpenseData
      .filter(exp => exp.date === today)
      .reduce((sum, exp) => sum + exp.amount, 0);
    const dailyBalance = dailyIncome - dailyExpenses;
    
    // Monthly calculations (simplified - in real app filter by actual month)
    const monthlyIncome = totalIncome;
    const monthlyExpenses = totalExpenses;
    const monthlyBalance = netBalance;
    
    return {
      totalIncome,
      totalExpenses,
      netBalance,
      dailyIncome,
      dailyExpenses,
      dailyBalance,
      monthlyIncome,
      monthlyExpenses,
      monthlyBalance,
    };
  }, [selectedDate]);

  const dailyData = useMemo(() => {
    // Group by date and calculate daily totals
    const dateMap = new Map<string, { income: number; expenses: number }>();
    
    // Initialize with all dates
    [...mockIncomeData, ...mockExpenseData].forEach(item => {
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, { income: 0, expenses: 0 });
      }
    });
    
    // Sum incomes
    mockIncomeData.forEach(item => {
      const current = dateMap.get(item.date)!;
      dateMap.set(item.date, { ...current, income: current.income + item.amount });
    });
    
    // Sum expenses
    mockExpenseData.forEach(item => {
      const current = dateMap.get(item.date)!;
      dateMap.set(item.date, { ...current, expenses: current.expenses + item.amount });
    });
    
    return Array.from(dateMap.entries())
      .map(([date, values]) => ({
        date,
        income: values.income,
        expenses: values.expenses,
        balance: values.income - values.expenses,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, []);

  const categoryComparison = useMemo(() => [
    { name: 'Ingresos', value: stats.totalIncome, fill: '#10b981' },
    { name: 'Egresos', value: stats.totalExpenses, fill: '#ef4444' },
  ], [stats]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const getTrend = (value: number) => {
    return value >= 0 ? 'up' : 'down';
  };

  return (
    <div className="totals-page">
      <div className="page-header">
        <div>
          <h1>Totales</h1>
          <p>Cálculo automático de ingresos, egresos y balance</p>
        </div>
        <div className="period-selector">
          <label htmlFor="period">Período:</label>
          <select 
            id="period"
            value={period} 
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            aria-label="Seleccionar período"
          >
            <option value="day">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="quarter">Este trimestre</option>
            <option value="year">Este año</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="totals-summary">
        <h2>Resumen del Período</h2>
        <div className="stats-grid">
          <StatCard
            title="Ingresos Totales"
            value={formatCurrency(stats.totalIncome)}
            subtitle="Acumulado"
            icon={<TrendingUp size={24} />}
            color="success"
            trend="up"
            trendValue="12%"
          />
          <StatCard
            title="Egresos Totales"
            value={formatCurrency(stats.totalExpenses)}
            subtitle="Acumulado"
            icon={<TrendingDown size={24} />}
            color="danger"
            trend="up"
            trendValue="8%"
          />
          <StatCard
            title="Balance Neto"
            value={formatCurrency(stats.netBalance)}
            subtitle="Ingresos - Egresos"
            icon={<Scale size={24} />}
            color={stats.netBalance >= 0 ? 'success' : 'danger'}
            trend={getTrend(stats.netBalance)}
            trendValue={stats.netBalance >= 0 ? 'Positivo' : 'Negativo'}
          />
        </div>
      </div>

      {/* Daily Balance */}
      <div className="daily-balance-section">
        <h2>Balance del Día {new Date(selectedDate).toLocaleDateString('es-AR')}</h2>
        <div className="daily-stats-grid">
          <div className={`daily-stat ${stats.dailyBalance >= 0 ? 'positive' : 'negative'}`}>
            <div className="daily-stat-icon">
              {stats.dailyBalance >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
            </div>
            <div className="daily-stat-content">
              <span className="daily-stat-label">Balance del Día</span>
              <span className="daily-stat-value">{formatCurrency(stats.dailyBalance)}</span>
            </div>
          </div>
          
          <div className="daily-stat income">
            <div className="daily-stat-icon">
              <DollarSign size={24} />
            </div>
            <div className="daily-stat-content">
              <span className="daily-stat-label">Ingresos del Día</span>
              <span className="daily-stat-value">{formatCurrency(stats.dailyIncome)}</span>
            </div>
          </div>
          
          <div className="daily-stat expense">
            <div className="daily-stat-icon">
              <Calendar size={24} />
            </div>
            <div className="daily-stat-content">
              <span className="daily-stat-label">Egresos del Día</span>
              <span className="daily-stat-value">{formatCurrency(stats.dailyExpenses)}</span>
            </div>
          </div>
        </div>
        
        <div className="date-picker">
          <label htmlFor="date">Seleccionar fecha:</label>
          <input
            id="date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Seleccionar fecha para ver balance"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <ChartContainer 
          title="Evolución Diaria" 
          subtitle="Ingresos vs Egresos por día"
          className="chart-full-width"
        >
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={dailyData}>
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
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => new Date(label).toLocaleDateString('es-AR')}
              />
              <Legend />
              <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="balance" name="Balance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Comparación Global">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryComparison} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} stroke="#6b7280" />
              <YAxis type="category" dataKey="name" stroke="#6b7280" width={80} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="comparison-summary">
            <div className="comparison-item">
              <span className="comparison-label">Diferencia:</span>
              <span className={`comparison-value ${stats.netBalance >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(stats.netBalance)}
              </span>
            </div>
            <div className="comparison-item">
              <span className="comparison-label">Margen:</span>
              <span className="comparison-value">
                {stats.totalIncome > 0 
                  ? `${((stats.netBalance / stats.totalIncome) * 100).toFixed(1)}%` 
                  : '0%'}
              </span>
            </div>
          </div>
        </ChartContainer>

        <ChartContainer title="Balance Acumulado">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => new Date(label).toLocaleDateString('es-AR')}
              />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="#3b82f6" 
                fillOpacity={1} 
                fill="url(#colorBalance)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Daily Movements Table */}
      <div className="movements-section">
        <h2>Movimientos del Período</h2>
        <Table
          data={dailyData}
          columns={[
            {
              key: 'date',
              header: 'Fecha',
              render: (item) => new Date(item.date).toLocaleDateString('es-AR'),
              sortable: true,
            },
            {
              key: 'income',
              header: 'Ingresos',
              render: (item) => (
                <span className="amount-income">{formatCurrency(item.income)}</span>
              ),
              sortable: true,
            },
            {
              key: 'expenses',
              header: 'Egresos',
              render: (item) => (
                <span className="amount-expense">{formatCurrency(item.expenses)}</span>
              ),
              sortable: true,
            },
            {
              key: 'balance',
              header: 'Balance',
              render: (item) => (
                <span className={`amount-balance ${item.balance >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(item.balance)}
                </span>
              ),
              sortable: true,
            },
          ]}
          itemsPerPage={7}
          searchable={true}
          searchKeys={['date']}
        />
      </div>
    </div>
  );
};

export default Totals;

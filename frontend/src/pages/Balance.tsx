import React, { useMemo } from 'react';
import { 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Target,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import { ChartContainer } from '../components/ui';
import './Balance.css';

// Mock data representing monthly data
const monthlyData = [
  { month: 'Ene', income: 150000, expenses: 120000, savings: 30000 },
  { month: 'Feb', income: 145000, expenses: 115000, savings: 30000 },
  { month: 'Mar', income: 160000, expenses: 125000, savings: 35000 },
  { month: 'Abr', income: 175000, expenses: 130000, savings: 45000 },
  { month: 'May', income: 168000, expenses: 135000, savings: 33000 },
  { month: 'Jun', income: 180000, expenses: 140000, savings: 40000 },
];

const expenseBreakdown = [
  { name: 'Sueldos', value: 215000, color: '#ef4444' },
  { name: 'Alquiler', value: 45000, color: '#f97316' },
  { name: 'Servicios', value: 12000, color: '#f59e0b' },
  { name: 'Insumos', value: 15000, color: '#84cc16' },
  { name: 'Otros', value: 18000, color: '#6b7280' },
];

const incomeBreakdown = [
  { name: 'Ventas', value: 650000, color: '#3b82f6' },
  { name: 'Servicios', value: 280000, color: '#10b981' },
  { name: 'Otros', value: 42000, color: '#8b5cf6' },
];

const Balance: React.FC = () => {
  const stats = useMemo(() => {
    const totalIncome = monthlyData.reduce((sum, m) => sum + m.income, 0);
    const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0);
    const totalSavings = totalIncome - totalExpenses;
    const avgMonthlyIncome = totalIncome / monthlyData.length;
    const avgMonthlyExpense = totalExpenses / monthlyData.length;
    const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;
    
    // Current month (last in array)
    const currentMonth = monthlyData[monthlyData.length - 1];
    const previousMonth = monthlyData[monthlyData.length - 2];
    const incomeChange = previousMonth ? 
      ((currentMonth.income - previousMonth.income) / previousMonth.income) * 100 : 0;
    const expenseChange = previousMonth ? 
      ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100 : 0;
    
    return {
      totalIncome,
      totalExpenses,
      totalSavings,
      avgMonthlyIncome,
      avgMonthlyExpense,
      savingsRate,
      currentMonth,
      incomeChange,
      expenseChange,
    };
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCompact = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}k`;
    }
    return `$${amount}`;
  };

  return (
    <div className="balance-page">
      <div className="page-header">
        <div>
          <h1>Balance</h1>
          <p>Dashboard financiero y análisis de tu negocio</p>
        </div>
        <div className="current-period">
          <Calendar size={16} />
          <span>Período: Enero - Junio 2026</span>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="balance-main-stats">
        <div className="stat-card-large income-card">
          <div className="stat-card-header">
            <div className="stat-icon-wrapper income">
              <TrendingUp size={24} />
            </div>
            <div className={`stat-trend ${stats.incomeChange >= 0 ? 'positive' : 'negative'}`}>
              {stats.incomeChange >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              <span>{Math.abs(stats.incomeChange).toFixed(1)}%</span>
            </div>
          </div>
          <div className="stat-card-body">
            <span className="stat-label">Ingresos Totales</span>
            <span className="stat-value">{formatCompact(stats.totalIncome)}</span>
            <span className="stat-subtitle">Promedio mensual: {formatCurrency(stats.avgMonthlyIncome)}</span>
          </div>
        </div>

        <div className="stat-card-large expense-card">
          <div className="stat-card-header">
            <div className="stat-icon-wrapper expense">
              <TrendingDown size={24} />
            </div>
            <div className={`stat-trend ${stats.expenseChange >= 0 ? 'negative' : 'positive'}`}>
              {stats.expenseChange >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              <span>{Math.abs(stats.expenseChange).toFixed(1)}%</span>
            </div>
          </div>
          <div className="stat-card-body">
            <span className="stat-label">Egresos Totales</span>
            <span className="stat-value">{formatCompact(stats.totalExpenses)}</span>
            <span className="stat-subtitle">Promedio mensual: {formatCurrency(stats.avgMonthlyExpense)}</span>
          </div>
        </div>

        <div className="stat-card-large balance-card">
          <div className="stat-card-header">
            <div className={`stat-icon-wrapper ${stats.totalSavings >= 0 ? 'positive' : 'negative'}`}>
              <Wallet size={24} />
            </div>
            <div className="stat-trend positive">
              <Target size={16} />
              <span>{stats.savingsRate.toFixed(1)}%</span>
            </div>
          </div>
          <div className="stat-card-body">
            <span className="stat-label">Balance Neto</span>
            <span className={`stat-value ${stats.totalSavings >= 0 ? 'positive' : 'negative'}`}>
              {formatCompact(stats.totalSavings)}
            </span>
            <span className="stat-subtitle">
              Tasa de ahorro: {stats.savingsRate.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="stat-card-large savings-card">
          <div className="stat-card-header">
            <div className="stat-icon-wrapper savings">
              <PiggyBank size={24} />
            </div>
          </div>
          <div className="stat-card-body">
            <span className="stat-label">Ahorro Acumulado</span>
            <span className="stat-value positive">{formatCompact(Math.max(0, stats.totalSavings))}</span>
            <span className="stat-subtitle">Últimos 6 meses</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="balance-charts-grid">
        <ChartContainer 
          title="Evolución Mensual" 
          subtitle="Comparativa de ingresos vs egresos"
          className="chart-large"
        >
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis 
                dataKey="month" 
                stroke="#6b7280"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                stroke="#6b7280"
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
              />
              <Legend />
              <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="savings" name="Ahorro" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>

        <div className="charts-side">
          <ChartContainer title="Distribución de Egresos">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={expenseBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {expenseBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend-compact">
              {expenseBreakdown.map((item) => (
                <div key={item.name} className="legend-item-compact">
                  <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                  <span className="legend-name">{item.name}</span>
                  <span className="legend-value">{formatCompact(item.value)}</span>
                </div>
              ))}
            </div>
          </ChartContainer>

          <ChartContainer title="Distribución de Ingresos">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={incomeBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {incomeBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend-compact">
              {incomeBreakdown.map((item) => (
                <div key={item.name} className="legend-item-compact">
                  <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                  <span className="legend-name">{item.name}</span>
                  <span className="legend-value">{formatCompact(item.value)}</span>
                </div>
              ))}
            </div>
          </ChartContainer>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Ingreso Más Alto</span>
          <span className="metric-value">{formatCurrency(Math.max(...monthlyData.map(m => m.income)))}</span>
          <span className="metric-context">Mes de {monthlyData.find(m => m.income === Math.max(...monthlyData.map(x => x.income)))?.month}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Mejor Mes de Ahorro</span>
          <span className="metric-value positive">{formatCurrency(Math.max(...monthlyData.map(m => m.savings)))}</span>
          <span className="metric-context">Mes de {monthlyData.find(m => m.savings === Math.max(...monthlyData.map(x => x.savings)))?.month}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Promedio Diario</span>
          <span className="metric-value">{formatCurrency(stats.avgMonthlyIncome / 30)}</span>
          <span className="metric-context">Ingresos por día</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Proyección Anual</span>
          <span className="metric-value positive">{formatCompact(stats.avgMonthlyIncome * 12)}</span>
          <span className="metric-context">Ingresos estimados</span>
        </div>
      </div>
    </div>
  );
};

export default Balance;

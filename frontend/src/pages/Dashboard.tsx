import React, { useEffect, useState } from 'react';
import { billingService, stockService, paymentsService, syncService } from '../services';
import { useAlerts } from '../components';
import './Dashboard.css';

interface DashboardStats {
  invoices: {
    total: number;
    today: number;
    month: number;
  };
  stock: {
    totalProducts: number;
    lowStock: number;
    movements: number;
  };
  payments: {
    total: number;
    pending: number;
    completed: number;
  };
  sync: {
    pending: number;
    lastSync: string;
  };
}

const Dashboard: React.FC = () => {
  const { showError } = useAlerts();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      // Fetch data from all services
      const [invoices, lowStock, payments, syncStatus] = await Promise.all([
        billingService.getInvoices(),
        stockService.getLowStockAlerts(),
        paymentsService.getPayments(),
        syncService.getStatus(),
      ]);

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const thisMonth = today.substring(0, 7);

      setStats({
        invoices: {
          total: invoices.length,
          today: invoices.filter((i) => i.createdAt.startsWith(today)).length,
          month: invoices.filter((i) => i.createdAt.startsWith(thisMonth)).length,
        },
        stock: {
          totalProducts: 0, // Would need separate API call
          lowStock: lowStock.length,
          movements: 0, // Would need separate API call
        },
        payments: {
          total: payments.length,
          pending: payments.filter((p) => p.status === 'pending').length,
          completed: payments.filter((p) => p.status === 'completed').length,
        },
        sync: {
          pending: syncStatus.pendingItems,
          lastSync: syncStatus.lastSyncAt || 'Nunca',
        },
      });
    } catch (error) {
      showError('Error al cargar datos del dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Cargando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      <div className="stats-grid">
        {/* Invoices Stats */}
        <div className="stat-card">
          <div className="stat-icon">📄</div>
          <div className="stat-content">
            <h3>Facturas</h3>
            <p className="stat-value">{stats?.invoices.total || 0}</p>
            <div className="stat-details">
              <span>Hoy: {stats?.invoices.today || 0}</span>
              <span>Este mes: {stats?.invoices.month || 0}</span>
            </div>
          </div>
        </div>

        {/* Stock Stats */}
        <div className="stat-card warning">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <h3>Stock Bajo</h3>
            <p className="stat-value">{stats?.stock.lowStock || 0}</p>
            <p className="stat-label">Productos requieren atención</p>
          </div>
        </div>

        {/* Payments Stats */}
        <div className="stat-card success">
          <div className="stat-icon">💳</div>
          <div className="stat-content">
            <h3>Pagos</h3>
            <p className="stat-value">{stats?.payments.total || 0}</p>
            <div className="stat-details">
              <span>Pendientes: {stats?.payments.pending || 0}</span>
              <span>Completados: {stats?.payments.completed || 0}</span>
            </div>
          </div>
        </div>

        {/* Sync Stats */}
        <div className="stat-card info">
          <div className="stat-icon">🔄</div>
          <div className="stat-content">
            <h3>Sincronización</h3>
            <p className="stat-value">{stats?.sync.pending || 0}</p>
            <p className="stat-label">Items pendientes</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2>Acciones Rápidas</h2>
        <div className="actions-grid">
          <button
            className="action-btn primary"
            onClick={() => window.location.href = '/billing'}
          >
            <span>📄</span>
            Nueva Factura
          </button>
          <button
            className="action-btn"
            onClick={() => window.location.href = '/stock'}
          >
            <span>📦</span>
            Ver Stock
          </button>
          <button
            className="action-btn"
            onClick={() => window.location.href = '/payments'}
          >
            <span>💳</span>
            Procesar Pago
          </button>
          <button
            className="action-btn"
            onClick={() => window.location.href = '/sync'}
          >
            <span>🔄</span>
            Sincronizar
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

import React, { useState, useEffect } from 'react';
import { syncService } from '../services';
import { useAlerts } from '../components';
import './Sync.css';

interface SyncStatus {
  lastSyncAt?: string;
  pendingItems: number;
  failedItems: number;
  isOnline: boolean;
  syncInProgress: boolean;
}

interface QueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entity: 'invoice' | 'stock_movement' | 'payment' | 'customer' | 'product';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  errorMessage?: string;
  timestamp: string;
}

const Sync: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);  // Used for initial data load
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectivity, setConnectivity] = useState({ isOnline: true, latency: 0 });

  useEffect(() => {
    loadData();
    checkConnectivity();
    
    // Check connectivity every 30 seconds
    const interval = setInterval(checkConnectivity, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statusData, queueData] = await Promise.all([
        syncService.getStatus(),
        syncService.getPendingItems(),
      ]);
      setStatus(statusData);
      setQueueItems(queueData);
    } catch (error) {
      showError('Error al cargar estado de sincronización');
    } finally {
      setIsLoading(false);
    }
  };

  const checkConnectivity = async () => {
    const result = await syncService.checkConnectivity();
    setConnectivity(result);
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const result = await syncService.triggerSync();
      showSuccess(`Sincronización completada: ${result.processed} procesados, ${result.failed} fallidos`);
      loadData();
    } catch (error) {
      showError('Error al sincronizar');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetry = async () => {
    try {
      setIsSyncing(true);
      const result = await syncService.retryFailed();
      showSuccess(`Reintentos completados: ${result.processed} procesados, ${result.failed} fallidos`);
      loadData();
    } catch (error) {
      showError('Error al reintentar');
    } finally {
      setIsSyncing(false);
    }
  };

  const getEntityIcon = (entity: string) => {
    const icons: Record<string, string> = {
      invoice: '📄',
      stock_movement: '📦',
      payment: '💳',
      customer: '👤',
      product: '📋',
    };
    return icons[entity] || '📄';
  };

  const getEntityLabel = (entity: string) => {
    const labels: Record<string, string> = {
      invoice: 'Factura',
      stock_movement: 'Movimiento Stock',
      payment: 'Pago',
      customer: 'Cliente',
      product: 'Producto',
    };
    return labels[entity] || entity;
  };

  const getOperationLabel = (operation: string) => {
    const labels: Record<string, { text: string; class: string }> = {
      create: { text: 'Crear', class: 'op-create' },
      update: { text: 'Actualizar', class: 'op-update' },
      delete: { text: 'Eliminar', class: 'op-delete' },
    };
    return labels[operation] || { text: operation, class: '' };
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      pending: { class: 'badge-pending', label: 'Pendiente' },
      processing: { class: 'badge-processing', label: 'Procesando' },
      completed: { class: 'badge-completed', label: 'Completado' },
      failed: { class: 'badge-failed', label: 'Fallido' },
    };
    const badge = badges[status] || { class: 'badge-default', label: status };
    return <span className={`status-badge ${badge.class}`}>{badge.label}</span>;
  };

  const formatLastSync = (date?: string) => {
    if (!date) return 'Nunca';
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    
    if (diff < 60) return 'Hace unos segundos';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
    return d.toLocaleString();
  };

  return (
    <div className="sync-page">
      <div className="page-header">
        <h1>Sincronización</h1>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={handleRetry}
            disabled={isSyncing || !queueItems.some(i => i.status === 'failed')}
          >
            🔄 Reintentar Fallidos
          </button>
          <button
            className="btn-primary"
            onClick={handleSync}
            disabled={isSyncing || !connectivity.isOnline}
          >
            {isSyncing ? '⏳ Sincronizando...' : '📤 Sincronizar Ahora'}
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="status-cards">
        <div className={`status-card ${connectivity.isOnline ? 'online' : 'offline'}`}>
          <div className="status-icon">{connectivity.isOnline ? '🟢' : '🔴'}</div>
          <div className="status-content">
            <span className="status-label">Conectividad</span>
            <span className="status-value">
              {connectivity.isOnline ? 'En Línea' : 'Sin Conexión'}
            </span>
            {connectivity.isOnline && connectivity.latency > 0 && (
              <span className="status-detail">{connectivity.latency}ms</span>
            )}
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">⏰</div>
          <div className="status-content">
            <span className="status-label">Última Sincronización</span>
            <span className="status-value">
              {formatLastSync(status?.lastSyncAt)}
            </span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">📋</div>
          <div className="status-content">
            <span className="status-label">Items Pendientes</span>
            <span className="status-value">{status?.pendingItems || 0}</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">❌</div>
          <div className="status-content">
            <span className="status-label">Items Fallidos</span>
            <span className={`status-value ${status?.failedItems ? 'has-failures' : ''}`}>
              {status?.failedItems || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Queue Items */}
      <div className="queue-section">
        <h2>Cola de Sincronización</h2>
        
        {queueItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <p>No hay items pendientes en la cola</p>
            <span>Todos los datos están sincronizados</span>
          </div>
        ) : isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Cargando cola de sincronización...</p>
          </div>
        ) : (
          <div className="queue-table-container">
            <table className="data-table queue-table">
              <thead>
                <tr>
                  <th>Entidad</th>
                  <th>Operación</th>
                  <th>Estado</th>
                  <th>Intentos</th>
                  <th>Error</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.map(item => (
                  <tr key={item.id} className={item.status}>
                    <td>
                      <span className="entity-cell">
                        <span className="entity-icon">{getEntityIcon(item.entity)}</span>
                        <span className="entity-name">{getEntityLabel(item.entity)}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`operation-badge ${getOperationLabel(item.operation).class}`}>
                        {getOperationLabel(item.operation).text}
                      </span>
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      {item.retryCount > 0 && (
                        <span className="retry-count">{item.retryCount} intentos</span>
                      )}
                    </td>
                    <td>
                      {item.errorMessage && (
                        <span className="error-message" title={item.errorMessage}>
                          {item.errorMessage.length > 30 
                            ? item.errorMessage.substring(0, 30) + '...' 
                            : item.errorMessage}
                        </span>
                      )}
                    </td>
                    <td>{new Date(item.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Offline Info */}
      <div className="info-section">
        <h3>📴 Modo Offline</h3>
        <div className="info-grid">
          <div className="info-card">
            <strong>Trabajo sin conexión</strong>
            <p>La aplicación continúa funcionando sin internet. Los datos se almacenan localmente.</p>
          </div>
          <div className="info-card">
            <strong>Sincronización automática</strong>
            <p>Cuando recupera conexión, los datos se sincronizan automáticamente.</p>
          </div>
          <div className="info-card">
            <strong>Resolución de conflictos</strong>
            <p>Si hay conflictos, se te notificará para decidir qué versión conservar.</p>
          </div>
          <div className="info-card">
            <strong>Cola local</strong>
            <p>Los cambios pendientes se guardan en la cola hasta poder sincronizar.</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-section">
        <button
          className="btn-secondary"
          onClick={() => syncService.clearLocalQueue()}
          disabled={queueItems.length === 0}
        >
          🗑️ Limpiar Cola Local
        </button>
        <button
          className="btn-secondary"
          onClick={checkConnectivity}
        >
          🔄 Verificar Conectividad
        </button>
      </div>
    </div>
  );
};

export default Sync;

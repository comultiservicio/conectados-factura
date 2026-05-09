import React, { useState, useMemo } from 'react';
import { Search, Filter, Download, Calendar, User, Activity } from 'lucide-react';
import { useAuth, Environment } from '../context/AuthContext';
import { Table, StatCard } from '../components/ui';
import { useAlerts } from '../components';
import './Logs.css';

const environmentLabels: Record<Environment, string> = {
  compras: 'Compras',
  ventas: 'Ventas',
  rendicion: 'Rendición',
  tesoreria: 'Tesorería',
  procesos: 'Procesos',
  admin: 'Administración',
};


const Logs: React.FC = () => {
  const { logs, isSystemAdmin } = useAuth();
  const { showError } = useAlerts();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnvironment, setFilterEnvironment] = useState<Environment | 'all'>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  if (!isSystemAdmin) {
    showError('Solo el administrador del sistema puede ver los logs');
    return (
      <div className="logs-unauthorized">
        <h2>🚫 Acceso Restringido</h2>
        <p>Esta página solo está disponible para el administrador del sistema.</p>
      </div>
    );
  }

  // Get unique users from logs
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    logs.forEach(log => users.add(log.userName));
    return Array.from(users);
  }, [logs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matches = 
          log.userName.toLowerCase().includes(search) ||
          log.action.toLowerCase().includes(search) ||
          (log.details && log.details.toLowerCase().includes(search));
        if (!matches) return false;
      }

      // Environment filter
      if (filterEnvironment !== 'all' && log.environment !== filterEnvironment) {
        return false;
      }

      // User filter
      if (filterUser !== 'all' && log.userName !== filterUser) {
        return false;
      }

      // Date filters
      if (dateFrom) {
        const fromDate = new Date(dateFrom).toISOString();
        if (log.timestamp < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        if (log.timestamp > toDate.toISOString()) return false;
      }

      return true;
    });
  }, [logs, searchTerm, filterEnvironment, filterUser, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const totalLogs = logs.length;
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(l => l.timestamp.startsWith(today)).length;
    
    const envCounts = logs.reduce((acc, log) => {
      acc[log.environment] = (acc[log.environment] || 0) + 1;
      return acc;
    }, {} as Record<Environment, number>);

    const mostActiveEnv = Object.entries(envCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalLogs,
      todayLogs,
      mostActiveEnv: mostActiveEnv ? environmentLabels[mostActiveEnv[0] as Environment] : '-',
      uniqueUsers: uniqueUsers.length,
    };
  }, [logs, uniqueUsers.length]);

  const handleExport = () => {
    const csvContent = [
      ['Fecha', 'Usuario', 'Entorno', 'Acción', 'Detalles'].join(','),
      ...filteredLogs.map(log => [
        new Date(log.timestamp).toLocaleString('es-AR'),
        log.userName,
        environmentLabels[log.environment],
        log.action,
        log.details || '',
      ].map(field => `"${field}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="logs-page">
      <div className="logs-header">
        <div>
          <h1>Logs de Actividad</h1>
          <p>Registro de todas las acciones realizadas en el sistema</p>
        </div>
        <button className="btn-export" onClick={handleExport}>
          <Download size={18} />
          Exportar CSV
        </button>
      </div>

      {/* Stats */}
      <div className="logs-stats">
        <StatCard
          title="Total Logs"
          value={stats.totalLogs.toLocaleString()}
          subtitle="Registros acumulados"
          icon={<Activity size={24} />}
          color="primary"
        />
        <StatCard
          title="Actividad Hoy"
          value={stats.todayLogs.toLocaleString()}
          subtitle="Logs del día"
          icon={<Calendar size={24} />}
          color="success"
        />
        <StatCard
          title="Entorno Más Activo"
          value={stats.mostActiveEnv}
          subtitle="Con más actividad"
          icon={<Activity size={24} />}
          color="info"
        />
        <StatCard
          title="Usuarios Activos"
          value={stats.uniqueUsers.toString()}
          subtitle="Usuarios con logs"
          icon={<User size={24} />}
          color="warning"
        />
      </div>

      {/* Filters */}
      <div className="logs-filters">
        <div className="filter-group search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar en logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <Filter size={16} />
            <select
              value={filterEnvironment}
              onChange={(e) => setFilterEnvironment(e.target.value as Environment | 'all')}
              aria-label="Filtrar por entorno"
            >
              <option value="all">Todos los entornos</option>
              {Object.entries(environmentLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <User size={16} />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              aria-label="Filtrar por usuario"
            >
              <option value="all">Todos los usuarios</option>
              {uniqueUsers.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group date">
            <Calendar size={16} />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Desde"
            />
            <span>-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Hasta"
            />
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="logs-results-info">
        Mostrando {filteredLogs.length} de {logs.length} registros
      </div>

      {/* Table */}
      <div className="logs-table-container">
        <Table
          data={filteredLogs}
          columns={[
            {
              key: 'timestamp',
              header: 'Fecha/Hora',
              render: (log) => (
                <span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleString('es-AR')}
                </span>
              ),
              sortable: true,
            },
            {
              key: 'userName',
              header: 'Usuario',
              render: (log) => (
                <span className="log-user">{log.userName}</span>
              ),
              sortable: true,
            },
            {
              key: 'environment',
              header: 'Entorno',
              render: (log) => (
                <span 
                  className="log-environment" 
                  data-environment={log.environment}
                >
                  {environmentLabels[log.environment]}
                </span>
              ),
              sortable: true,
            },
            {
              key: 'action',
              header: 'Acción',
              render: (log) => (
                <span className="log-action">{log.action}</span>
              ),
              sortable: true,
            },
            {
              key: 'details',
              header: 'Detalles',
              render: (log) => (
                <span className="log-details">
                  {log.details || '-'}
                </span>
              ),
            },
          ]}
          itemsPerPage={20}
          searchable={false}
          emptyMessage="No hay logs que coincidan con los filtros"
        />
      </div>
    </div>
  );
};

export default Logs;

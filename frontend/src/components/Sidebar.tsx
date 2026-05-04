import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, Environment, EnvironmentVisibility } from '../context/AuthContext';
import './Sidebar.css';

interface MenuSection {
  title: string;
  environment: Environment;
  items: MenuItem[];
}

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

const Sidebar: React.FC = () => {
  const { getEnvironmentVisibility, canAccessEnvironment, isAdminSistema, user } = useAuth();

  // Estructura de menú por entornos
  const menuSections: MenuSection[] = [
    {
      title: 'Principal',
      environment: 'ventas',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: '📊' },
      ],
    },
    {
      title: 'Compras',
      environment: 'compras',
      items: [
        { path: '/compras/proveedores', label: 'Proveedores', icon: '🏢' },
        { path: '/compras/ordenes', label: 'Órdenes de Compra', icon: '�' },
        { path: '/compras/recepcion', label: 'Recepción', icon: '📦' },
      ],
    },
    {
      title: 'Ventas',
      environment: 'ventas',
      items: [
        { path: '/ventas/cajas', label: 'Cajas', icon: '🏪' },
        { path: '/ventas/choferes', label: 'Choferes', icon: '🚚' },
        { path: '/ventas/comprobantes', label: 'Comprobantes', icon: '🧾' },
        { path: '/ventas/listado', label: 'Listado de Ventas', icon: '📄' },
        { path: '/scanner', label: 'Carga Boletas', icon: '📷' },
      ],
    },
    {
      title: 'Rendición',
      environment: 'rendicion',
      items: [
        { path: '/rendicion/cierre-caja', label: 'Cierre de Caja', icon: '🔒' },
        { path: '/rendicion/arqueo', label: 'Arqueo Diario', icon: '📈' },
        { path: '/rendicion/conciliacion', label: 'Conciliación', icon: '🔄' },
      ],
    },
    {
      title: 'Tesorería',
      environment: 'tesoreria',
      items: [
        { path: '/tesoreria/pagos', label: 'Pagos', icon: '💸' },
        { path: '/tesoreria/transferencias', label: 'Transferencias', icon: '�' },
        { path: '/tesoreria/bancos', label: 'Bancos', icon: '🏦' },
        { path: '/tesoreria/balances', label: 'Balances', icon: '⚖️' },
      ],
    },
    {
      title: 'Procesos',
      environment: 'procesos',
      items: [
        { path: '/procesos/cierre-mostrador', label: 'Cierre Mostrador', icon: '🏪' },
        { path: '/procesos/cierre-fiscal', label: 'Cierre Fiscal X', icon: '�' },
        { path: '/procesos/cierre-diario', label: 'Cierre Diario', icon: '�' },
        { path: '/procesos/envios', label: 'Envíos', icon: '📤' },
        { path: '/procesos/recepcion-suc', label: 'Recepción Sucursales', icon: '�' },
        { path: '/procesos/migracion', label: 'Migración de Datos', icon: '�' },
      ],
    },
  ];

  // Items de administración (solo admin y system_admin)
  const adminItems: MenuItem[] = [
    { path: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
    { path: '/admin/configuracion', label: 'Configuración', icon: '⚙️' },
  ];

  // Items de sistema (solo system_admin)
  const systemItems: MenuItem[] = [
    { path: '/logs', label: 'Logs de Actividad', icon: '📋' },
    { path: '/admin/entornos', label: 'Config. Entornos', icon: '🏗️' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Conectados</h2>
        <p className="sidebar-subtitle">Factura+</p>
        {user && (
          <div className="user-badge">
            <span className="user-role">{user.role.replace('_', ' ')}</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <ul className="menu-list">
          {/* Mostrar Dashboard para todos */}
          <li className="menu-item">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? 'menu-link active' : 'menu-link'
              }
            >
              <span className="menu-icon">📊</span>
              <span className="menu-label">Dashboard</span>
            </NavLink>
          </li>

          {/* Secciones por entorno - mostrar todos, habilitados y deshabilitados */}
          {menuSections.map((section) => {
            // No mostrar la sección Principal de nuevo
            if (section.title === 'Principal') return null;
            
            const visibility = getEnvironmentVisibility(section.environment);
            
            // No mostrar si no es visible para este rol
            if (!visibility.visible) return null;

            const isEnabled = visibility.enabled;
            const phase = visibility.phase;

            return (
              <React.Fragment key={section.title}>
                <li className={`menu-divider ${!isEnabled ? 'disabled' : ''}`}>
                  <span>{section.title}</span>
                  {!isEnabled && <span className="phase-badge">{phase}</span>}
                </li>
                {section.items.map((item) => (
                  <li key={item.path} className="menu-item">
                    {isEnabled ? (
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          isActive ? 'menu-link active' : 'menu-link'
                        }
                      >
                        <span className="menu-icon">{item.icon}</span>
                        <span className="menu-label">{item.label}</span>
                      </NavLink>
                    ) : (
                      <div className="menu-link disabled">
                        <span className="menu-icon">{item.icon}</span>
                        <span className="menu-label">{item.label}</span>
                      </div>
                    )}
                  </li>
                ))}
              </React.Fragment>
            );
          })}

          {/* Sección Administración (solo admins) */}
          {canAccessEnvironment('admin') && (
            <>
              <li className="menu-divider">
                <span>Administración</span>
              </li>
              {adminItems.map((item) => (
                <li key={item.path} className="menu-item">
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      isActive ? 'menu-link active' : 'menu-link'
                    }
                  >
                    <span className="menu-icon">{item.icon}</span>
                    <span className="menu-label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </>
          )}

          {/* Sección Sistema (solo system_admin) */}
          {isAdminSistema && (
            <>
              <li className="menu-divider admin-section">
                <span>Sistema</span>
              </li>
              {systemItems.map((item) => (
                <li key={item.path} className="menu-item admin-item">
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      isActive ? 'menu-link active' : 'menu-link'
                    }
                  >
                    <span className="menu-icon">{item.icon}</span>
                    <span className="menu-label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </>
          )}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <p className="version">v2.0.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;

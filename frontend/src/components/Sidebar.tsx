import React from 'react';
import { NavLink } from 'react-router-dom';
import { authService } from '../services';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const isAdmin = authService.isAdmin();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/billing', label: 'Facturación', icon: '📄' },
    { path: '/stock', label: 'Stock', icon: '📦' },
    { path: '/payments', label: 'Pagos', icon: '💳' },
    { path: '/sync', label: 'Sincronización', icon: '🔄' },
    { path: '/ocr', label: 'Documentos', icon: '📄' },
  ];

  const adminItems = [
    { path: '/admin/users', label: 'Usuarios', icon: '👥' },
    { path: '/admin/settings', label: 'Configuración', icon: '⚙️' },
  ];

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <ul className="menu-list">
          {menuItems.map((item) => (
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

          {isAdmin && (
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
        </ul>
      </nav>

      <div className="sidebar-footer">
        <p className="version">v1.0.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;

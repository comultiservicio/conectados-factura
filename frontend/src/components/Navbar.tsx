import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services';
import './Navbar.css';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();
  const isAdmin = authService.isAdmin();

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/dashboard">
          <h1>Conectados Factura+</h1>
        </Link>
      </div>

      <div className="navbar-menu">
        {user && (
          <>
            <div className="navbar-user">
              <span className="user-name">{user.name}</span>
              {isAdmin && <span className="user-badge admin">Admin</span>}
            </div>
            <button onClick={handleLogout} className="logout-btn">
              Cerrar Sesión
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

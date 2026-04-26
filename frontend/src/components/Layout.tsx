import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useAlerts } from './Alerts';
import './Layout.css';

const Layout: React.FC = () => {
  const { AlertContainer } = useAlerts();

  return (
    <div className="layout">
      <Navbar />
      <div className="layout-container">
        <Sidebar />
        <main className="main-content">
          <AlertContainer />
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

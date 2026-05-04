
import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout, PrivateRoute, EnvironmentRoute } from './components';
import { Login, Dashboard, Billing, Stock, Payments, Sync, Ocr, Income, Expenses, Totals, Balance, Logs, CameraScanner } from './pages';
import { ImportExcel } from './components';
import './App.css';

// Placeholder component for under-construction pages
const ComingSoon: React.FC<{ title: string }> = ({ title }) => (
  <div className="coming-soon">
    <h2>{title}</h2>
    <p>Módulo en desarrollo</p>
  </div>
);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Protected Routes */}
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          {/* Dashboard - Accessible to all authenticated users */}
          <Route path="dashboard" element={<Dashboard />} />

          {/* === ENTORNO: COMPRAS === */}
          <Route path="compras/*" element={<Outlet />}>
            <Route 
              path="proveedores" 
              element={
                <EnvironmentRoute environment="compras">
                  <ComingSoon title="Proveedores" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="ordenes" 
              element={
                <EnvironmentRoute environment="compras">
                  <ComingSoon title="Órdenes de Compra" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="recepcion" 
              element={
                <EnvironmentRoute environment="compras">
                  <Stock />
                </EnvironmentRoute>
              } 
            />
          </Route>

          {/* === ENTORNO: VENTAS === */}
          <Route path="ventas/*" element={<Outlet />}>
            <Route 
              path="cajas" 
              element={
                <EnvironmentRoute environment="ventas">
                  <Income />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="choferes" 
              element={
                <EnvironmentRoute environment="ventas">
                  <ComingSoon title="Gestión de Choferes" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="comprobantes" 
              element={
                <EnvironmentRoute environment="ventas">
                  <Billing />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="listado" 
              element={
                <EnvironmentRoute environment="ventas">
                  <Income />
                </EnvironmentRoute>
              } 
            />
          </Route>

          {/* === ENTORNO: RENDICIÓN === */}
          <Route path="rendicion/*" element={<Outlet />}>
            <Route 
              path="cierre-caja" 
              element={
                <EnvironmentRoute environment="rendicion">
                  <ComingSoon title="Cierre de Caja" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="arqueo" 
              element={
                <EnvironmentRoute environment="rendicion">
                  <Totals />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="conciliacion" 
              element={
                <EnvironmentRoute environment="rendicion">
                  <Balance />
                </EnvironmentRoute>
              } 
            />
          </Route>

          {/* === ENTORNO: TESORERÍA === */}
          <Route path="tesoreria/*" element={<Outlet />}>
            <Route 
              path="pagos" 
              element={
                <EnvironmentRoute environment="tesoreria">
                  <Payments />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="transferencias" 
              element={
                <EnvironmentRoute environment="tesoreria">
                  <ComingSoon title="Transferencias" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="bancos" 
              element={
                <EnvironmentRoute environment="tesoreria">
                  <ComingSoon title="Gestión de Bancos" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="balances" 
              element={
                <EnvironmentRoute environment="tesoreria">
                  <Balance />
                </EnvironmentRoute>
              } 
            />
          </Route>

          {/* === ENTORNO: PROCESOS === */}
          <Route path="procesos/*" element={<Outlet />}>
            <Route 
              path="cierre-mostrador" 
              element={
                <EnvironmentRoute environment="procesos">
                  <ComingSoon title="Cierre Mostrador" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="cierre-fiscal" 
              element={
                <EnvironmentRoute environment="procesos">
                  <ComingSoon title="Cierre Fiscal X" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="cierre-diario" 
              element={
                <EnvironmentRoute environment="procesos">
                  <Totals />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="envios" 
              element={
                <EnvironmentRoute environment="procesos">
                  <Sync />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="recepcion-suc" 
              element={
                <EnvironmentRoute environment="procesos">
                  <ComingSoon title="Recepción Sucursales" />
                </EnvironmentRoute>
              } 
            />
            <Route 
              path="migracion" 
              element={
                <EnvironmentRoute environment="procesos">
                  <ImportExcel />
                </EnvironmentRoute>
              } 
            />
          </Route>

          {/* === Scanner / Camera === */}
          <Route 
            path="scanner" 
            element={
              <EnvironmentRoute environment="ventas">
                <CameraScanner />
              </EnvironmentRoute>
            } 
          />

          {/* === SISTEMA: Logs === */}
          <Route 
            path="logs" 
            element={
              <EnvironmentRoute environment="admin">
                <Logs />
              </EnvironmentRoute>
            } 
          />

          {/* Rutas legacy - mantener por compatibilidad */}
          <Route path="income" element={<Income />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="totals" element={<Totals />} />
          <Route path="balance" element={<Balance />} />
          <Route path="import" element={<ImportExcel />} />
          <Route path="billing" element={<Billing />} />
          <Route path="stock" element={<Stock />} />
          <Route path="payments" element={<Payments />} />
          <Route path="sync" element={<Sync />} />
          <Route path="ocr" element={<Ocr />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
};

export default App;

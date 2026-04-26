import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout, PrivateRoute } from './components';
import { Login, Dashboard } from './pages';
import './App.css';

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
          <Route path="dashboard" element={<Dashboard />} />
          {/* Additional routes will be added here */}
          <Route path="billing" element={<div>Facturación - En desarrollo</div>} />
          <Route path="stock" element={<div>Stock - En desarrollo</div>} />
          <Route path="payments" element={<div>Pagos - En desarrollo</div>} />
          <Route path="sync" element={<div>Sincronización - En desarrollo</div>} />
          <Route path="ocr" element={<div>OCR - En desarrollo</div>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
};

export default App;

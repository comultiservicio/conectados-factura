import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout, PrivateRoute } from './components';
import { Login, Dashboard, Billing, Stock, Payments, Sync, Ocr } from './pages';
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

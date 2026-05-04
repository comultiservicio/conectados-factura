import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, Environment } from '../context/AuthContext';

interface EnvironmentRouteProps {
  children: React.ReactNode;
  environment: Environment;
  fallback?: React.ReactNode;
}

const EnvironmentRoute: React.FC<EnvironmentRouteProps> = ({
  children,
  environment,
  fallback,
}) => {
  const { isAuthenticated, canAccessEnvironment, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessEnvironment(environment)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="access-denied">
        <div className="access-denied-content">
          <span className="access-denied-icon">🚫</span>
          <h2>Acceso Denegado</h2>
          <p>No tienes permisos para acceder a este entorno.</p>
          <p className="access-denied-environment">
            Entorno: <strong>{environment}</strong>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default EnvironmentRoute;

import React, { useState, useEffect } from 'react';
import './Alerts.css';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  type: AlertType;
  message: string;
  onClose?: () => void;
  autoClose?: boolean;
  duration?: number;
}

export const Alert: React.FC<AlertProps> = ({
  type,
  message,
  onClose,
  autoClose = true,
  duration = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, onClose]);

  if (!isVisible) return null;

  const icons: Record<AlertType, string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <div className={`alert alert-${type}`} role="alert">
      <span className="alert-icon">{icons[type]}</span>
      <span className="alert-message">{message}</span>
      <button
        className="alert-close"
        onClick={() => {
          setIsVisible(false);
          onClose?.();
        }}
        aria-label="Cerrar"
      >
        ×
      </button>
    </div>
  );
};

// Alert container for managing multiple alerts
interface AlertContainerProps {
  alerts: Array<{
    id: string;
    type: AlertType;
    message: string;
  }>;
  onRemove: (id: string) => void;
}

export const AlertContainer: React.FC<AlertContainerProps> = ({
  alerts,
  onRemove,
}) => {
  return (
    <div className="alert-container">
      {alerts.map((alert) => (
        <Alert
          key={alert.id}
          type={alert.type}
          message={alert.message}
          onClose={() => onRemove(alert.id)}
        />
      ))}
    </div>
  );
};

// Hook for managing alerts
export const useAlerts = () => {
  const [alerts, setAlerts] = useState<
    Array<{ id: string; type: AlertType; message: string }>
  >([]);

  const addAlert = (type: AlertType, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setAlerts((prev) => [...prev, { id, type, message }]);
  };

  const removeAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  const showSuccess = (message: string) => addAlert('success', message);
  const showError = (message: string) => addAlert('error', message);
  const showWarning = (message: string) => addAlert('warning', message);
  const showInfo = (message: string) => addAlert('info', message);

  return {
    alerts,
    addAlert,
    removeAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    AlertContainer: () => (
      <AlertContainer alerts={alerts} onRemove={removeAlert} />
    ),
  };
};

export default Alert;

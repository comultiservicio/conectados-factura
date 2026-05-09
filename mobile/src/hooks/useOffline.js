/**
 * Hook de React para manejo de estado offline/online
 * @module hooks/useOffline
 */

import { useState, useEffect, useCallback } from 'react';
import { syncManager } from '../utils/syncManager';

/**
 * Hook principal para detectar y manejar estado de conexión
 * @returns {Object} Estado y funciones de conectividad
 */
export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [connectionType, setConnectionType] = useState('unknown');

  // Detectar cambios en conexión
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync al recuperar conexión
      handleSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // Connection API para tipo de conexión
    const updateConnectionType = () => {
      if ('connection' in navigator) {
        const conn = navigator.connection;
        setConnectionType(conn.effectiveType || 'unknown');
      }
    };

    // Event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', updateConnectionType);
      updateConnectionType();
    }

    // Inicializar contador de cambios pendientes
    updatePendingCount();

    // Interval para actualizar contador
    const interval = setInterval(updatePendingCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if ('connection' in navigator) {
        navigator.connection.removeEventListener('change', updateConnectionType);
      }
      clearInterval(interval);
    };
  }, []);

  /**
   * Actualiza contador de cambios pendientes
   */
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await syncManager.getPendingCount();
      setPendingChanges(count);
    } catch (error) {
      console.error('Error obteniendo contador:', error);
    }
  }, []);

  /**
   * Ejecuta sincronización manual
   */
  const handleSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await syncManager.sync();
      setLastSync(new Date());
      updatePendingCount();
      return result;
    } catch (error) {
      console.error('Error en sync:', error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, updatePendingCount]);

  /**
   * Registra un cambio para sincronizar después
   */
  const queueChange = useCallback(async (change) => {
    try {
      await syncManager.queueChange(change);
      updatePendingCount();
    } catch (error) {
      console.error('Error encolando cambio:', error);
      throw error;
    }
  }, [updatePendingCount]);

  /**
   * Fuerza sincronización ignorando estado de conexión
   */
  const forceSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncManager.sync({ force: true });
      setLastSync(new Date());
      updatePendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [updatePendingCount]);

  return {
    isOnline,
    isSyncing,
    pendingChanges,
    lastSync,
    connectionType,
    isSlowConnection: connectionType === '2g' || connectionType === 'slow-2g',
    sync: handleSync,
    queueChange,
    forceSync,
    refreshPending: updatePendingCount
  };
}

/**
 * Hook para manejar formularios con soporte offline
 * @param {Object} options - Opciones del formulario
 * @returns {Object} Funciones del formulario
 */
export function useOfflineForm(options = {}) {
  const { 
    onSubmit, 
    storageKey, 
    autoSave = true,
    autoSaveInterval = 30000 
  } = options;

  const [formData, setFormData] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const { isOnline, queueChange } = useOffline();

  // Cargar datos guardados al montar
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`form-${storageKey}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData(parsed.data);
          setLastSaved(new Date(parsed.timestamp));
        } catch (e) {
          console.error('Error cargando formulario guardado:', e);
        }
      }
    }
  }, [storageKey]);

  // Auto-guardar
  useEffect(() => {
    if (!autoSave || !storageKey || !isDirty) return;

    const interval = setInterval(() => {
      saveToLocal();
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [autoSave, storageKey, isDirty, formData, autoSaveInterval]);

  /**
   * Guarda formulario en localStorage
   */
  const saveToLocal = useCallback(() => {
    if (!storageKey) return;

    const data = {
      data: formData,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem(`form-${storageKey}`, JSON.stringify(data));
    setLastSaved(new Date());
    setIsDirty(false);
  }, [formData, storageKey]);

  /**
   * Actualiza campo del formulario
   */
  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  /**
   * Envía formulario (online u offline)
   */
  const submit = useCallback(async () => {
    setIsSaving(true);

    try {
      if (isOnline) {
        // Online: enviar directamente
        const result = await onSubmit(formData);
        
        // Limpiar localStorage
        if (storageKey) {
          localStorage.removeItem(`form-${storageKey}`);
        }
        
        setFormData({});
        setIsDirty(false);
        
        return result;
      } else {
        // Offline: encolar para sync
        await queueChange({
          type: 'FORM_SUBMIT',
          key: storageKey,
          data: formData,
          timestamp: new Date().toISOString()
        });

        // Guardar en localStorage como backup
        saveToLocal();

        return { queued: true, message: 'Formulario guardado. Se enviará cuando haya conexión.' };
      }
    } finally {
      setIsSaving(false);
    }
  }, [isOnline, formData, onSubmit, storageKey, queueChange, saveToLocal]);

  /**
   * Limpia el formulario
   */
  const clear = useCallback(() => {
    setFormData({});
    setIsDirty(false);
    if (storageKey) {
      localStorage.removeItem(`form-${storageKey}`);
    }
  }, [storageKey]);

  return {
    formData,
    setFormData,
    updateField,
    isDirty,
    isSaving,
    lastSaved,
    submit,
    saveToLocal,
    clear,
    isOnline
  };
}

/**
 * Hook para fetch con reintentos automáticos
 * @param {string} url - URL a fetch
 * @param {Object} options - Opciones de fetch
 * @returns {Object} Estado y datos
 */
export function useOfflineFetch(url, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);

  const { isOnline } = useOffline();
  const { retries = 3, retryDelay = 1000 } = options;

  const fetchWithRetry = useCallback(async (attempt = 1) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      setIsOffline(false);
      
      // Guardar en cache local
      await syncManager.cacheResponse(url, result);
      
    } catch (err) {
      // Intentar obtener de cache
      const cached = await syncManager.getCachedResponse(url);
      
      if (cached) {
        setData(cached.data);
        setIsOffline(true);
      } else if (attempt < retries) {
        // Reintentar
        setTimeout(() => fetchWithRetry(attempt + 1), retryDelay * attempt);
        return;
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [url, options, retries, retryDelay]);

  useEffect(() => {
    fetchWithRetry();
  }, [fetchWithRetry]);

  // Reintentar cuando vuelve la conexión
  useEffect(() => {
    if (isOnline && error && !data) {
      fetchWithRetry();
    }
  }, [isOnline, error, data, fetchWithRetry]);

  return {
    data,
    loading,
    error,
    isOffline,
    refetch: fetchWithRetry
  };
}

/**
 * Componente que muestra indicador de estado offline
 */
export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingChanges, connectionType } = useOffline();

  if (isOnline && pendingChanges === 0 && !isSyncing) {
    return null;
  }

  let message = '';
  let color = '';

  if (!isOnline) {
    message = 'Sin conexión';
    color = '#ef4444';
  } else if (isSyncing) {
    message = 'Sincronizando...';
    color = '#3b82f6';
  } else if (pendingChanges > 0) {
    message = `${pendingChanges} cambios pendientes`;
    color = '#f59e0b';
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '12px 16px',
      backgroundColor: color,
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px'
    }}>
      {!isOnline && <span>📡</span>}
      {isSyncing && <span>🔄</span>}
      {pendingChanges > 0 && !isSyncing && <span>⏳</span>}
      {message}
      {connectionType !== 'unknown' && isOnline && (
        <span style={{ opacity: 0.8, fontSize: '12px' }}>
          ({connectionType})
        </span>
      )}
    </div>
  );
}

export default useOffline;

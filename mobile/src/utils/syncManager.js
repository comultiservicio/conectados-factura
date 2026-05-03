/**
 * Sync Manager - Gestión de sincronización offline/online
 * @module utils/syncManager
 */

import { openDB } from 'idb';

class SyncManager {
  constructor() {
    this.dbName = 'factura-plus-sync';
    this.dbVersion = 1;
    this.db = null;
    this.syncInProgress = false;
    this.syncListeners = [];
    this.apiUrl = process.env.REACT_APP_API_URL || 'http://192.168.15.80/api';
    
    this.init();
  }

  /**
   * Inicializa IndexedDB
   */
  async init() {
    try {
      this.db = await openDB(this.dbName, this.dbVersion, {
        upgrade(db) {
          // Store para cambios pendientes
          if (!db.objectStoreNames.contains('pending')) {
            db.createObjectStore('pending', { 
              keyPath: 'id', 
              autoIncrement: true 
            });
          }

          // Store para caché de respuestas
          if (!db.objectStoreNames.contains('cache')) {
            const cacheStore = db.createObjectStore('cache', { keyPath: 'url' });
            cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // Store para facturas offline
          if (!db.objectStoreNames.contains('facturas')) {
            const facturaStore = db.createObjectStore('facturas', { keyPath: 'localId' });
            facturaStore.createIndex('syncStatus', 'syncStatus', { unique: false });
            facturaStore.createIndex('fecha', 'fecha', { unique: false });
          }

          // Store para fotos pendientes
          if (!db.objectStoreNames.contains('fotos')) {
            const fotoStore = db.createObjectStore('fotos', { keyPath: 'localId' });
            fotoStore.createIndex('status', 'status', { unique: false });
          }
        }
      });

      console.log('✅ SyncManager: IndexedDB inicializado');
    } catch (error) {
      console.error('❌ SyncManager: Error inicializando IndexedDB:', error);
    }
  }

  /**
   * Agrega un cambio a la cola de sincronización
   */
  async queueChange(change) {
    if (!this.db) await this.init();

    const changeToStore = {
      ...change,
      status: 'pending',
      retries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.db.add('pending', changeToStore);
    
    // Notificar a listeners
    this.notifyListeners({ type: 'CHANGE_QUEUED', change: changeToStore });
    
    // Intentar sync si estamos online
    if (navigator.onLine) {
      this.sync();
    }

    return changeToStore;
  }

  /**
   * Guarda una factura localmente (offline)
   */
  async saveFacturaLocal(factura) {
    if (!this.db) await this.init();

    const facturaToStore = {
      ...factura,
      localId: factura.localId || `local-${Date.now()}`,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.db.put('facturas', facturaToStore);
    
    // También encolar para sync
    await this.queueChange({
      type: 'CREATE_FACTURA',
      localId: facturaToStore.localId,
      data: facturaToStore
    });

    return facturaToStore;
  }

  /**
   * Obtiene facturas locales
   */
  async getFacturasLocales(status = null) {
    if (!this.db) await this.init();

    if (status) {
      return await this.db.getAllFromIndex('facturas', 'syncStatus', status);
    }

    return await this.db.getAll('facturas');
  }

  /**
   * Guarda una foto para upload posterior
   */
  async queueFoto(fotoBlob, metadata = {}) {
    if (!this.db) await this.init();

    const foto = {
      localId: `foto-${Date.now()}`,
      blob: fotoBlob,
      status: 'pending',
      ...metadata,
      createdAt: new Date().toISOString()
    };

    await this.db.add('fotos', foto);

    await this.queueChange({
      type: 'UPLOAD_FOTO',
      localId: foto.localId,
      metadata
    });

    return foto;
  }

  /**
   * Ejecuta sincronización con el servidor
   */
  async sync(options = {}) {
    if (this.syncInProgress && !options.force) {
      console.log('Sync ya en progreso...');
      return { synced: 0, skipped: true };
    }

    if (!navigator.onLine && !options.force) {
      console.log('Sin conexión, abortando sync');
      return { synced: 0, offline: true };
    }

    this.syncInProgress = true;
    this.notifyListeners({ type: 'SYNC_STARTED' });

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      // 1. Obtener cambios pendientes
      const pendingChanges = await this.db.getAll('pending');
      
      if (pendingChanges.length === 0) {
        console.log('No hay cambios pendientes');
        this.syncInProgress = false;
        this.notifyListeners({ type: 'SYNC_COMPLETED', result: { synced: 0 } });
        return { synced: 0 };
      }

      console.log(`Sincronizando ${pendingChanges.length} cambios...`);

      // 2. Preparar cambios para enviar
      const changesToSync = pendingChanges.map(change => {
        if (change.type === 'UPLOAD_FOTO') {
          // Las fotos se manejan separadamente
          return null;
        }
        return {
          id: change.id,
          type: change.type,
          data: change.data,
          localId: change.localId
        };
      }).filter(Boolean);

      // 3. Enviar cambios al servidor
      const response = await fetch(`${this.apiUrl}/sync/pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ changes: changesToSync })
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const result = await response.json();

      // 4. Procesar resultados
      let synced = 0;
      let errors = 0;

      for (const syncedItem of result.synced) {
        if (syncedItem.status === 'synced') {
          // Marcar como sincronizado
          await this.markAsSynced(syncedItem.id, syncedItem.serverId);
          synced++;
        } else if (syncedItem.status === 'error') {
          // Incrementar contador de reintentos
          await this.incrementRetry(syncedItem.id, syncedItem.error);
          errors++;
        }
      }

      // 5. Sync de fotos pendientes
      const fotoResult = await this.syncFotos(token);

      // 6. Obtener cambios del servidor (facturas creadas en otros dispositivos)
      await this.pullChanges(token);

      const finalResult = {
        synced,
        errors,
        fotos: fotoResult.synced,
        total: pendingChanges.length
      };

      this.notifyListeners({ type: 'SYNC_COMPLETED', result: finalResult });
      
      return finalResult;

    } catch (error) {
      console.error('Error en sync:', error);
      this.notifyListeners({ type: 'SYNC_ERROR', error });
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sincroniza fotos pendientes
   */
  async syncFotos(token) {
    const pendingFotos = await this.db.getAllFromIndex('fotos', 'status', 'pending');
    
    if (pendingFotos.length === 0) {
      return { synced: 0 };
    }

    let synced = 0;

    for (const foto of pendingFotos) {
      try {
        const formData = new FormData();
        formData.append('file', foto.blob, 'foto.jpg');
        formData.append('localId', foto.localId);
        
        if (foto.facturaId) {
          formData.append('facturaId', foto.facturaId);
        }

        const response = await fetch(`${this.apiUrl}/upload/foto`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (response.ok) {
          // Marcar como sincronizado
          await this.db.put('fotos', { ...foto, status: 'synced' });
          synced++;
        } else {
          throw new Error(`Upload failed: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error sincronizando foto ${foto.localId}:`, error);
        // Mantener en pending para reintento
      }
    }

    return { synced };
  }

  /**
   * Obtiene cambios del servidor
   */
  async pullChanges(token) {
    try {
      // Obtener última fecha de sync
      const lastSync = localStorage.getItem('lastSync') || '1970-01-01T00:00:00Z';

      const response = await fetch(
        `${this.apiUrl}/sync/changes?since=${encodeURIComponent(lastSync)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }

      const result = await response.json();

      // Guardar cambios locales
      for (const change of result.changes) {
        // Evitar sobrescribir cambios locales más recientes
        const existing = await this.db.get('facturas', change.id);
        
        if (!existing || existing.syncStatus === 'synced') {
          await this.db.put('facturas', {
            ...change,
            syncStatus: 'synced',
            updatedAt: new Date().toISOString()
          });
        }
      }

      // Actualizar última fecha de sync
      localStorage.setItem('lastSync', new Date().toISOString());

      return result.changes.length;
    } catch (error) {
      console.error('Error en pull:', error);
      return 0;
    }
  }

  /**
   * Marca un cambio como sincronizado
   */
  async markAsSynced(id, serverId) {
    // Eliminar de pending
    await this.db.delete('pending', id);

    // Actualizar factura si aplica
    if (serverId) {
      const factura = await this.db.get('facturas', id);
      if (factura) {
        await this.db.put('facturas', {
          ...factura,
          id: serverId,
          syncStatus: 'synced',
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Incrementa contador de reintentos
   */
  async incrementRetry(id, error) {
    const change = await this.db.get('pending', id);
    if (change) {
      const retries = (change.retries || 0) + 1;
      
      if (retries >= 5) {
        // Máximo de reintentos alcanzado
        await this.db.put('pending', {
          ...change,
          status: 'failed',
          retries,
          lastError: error,
          updatedAt: new Date().toISOString()
        });
      } else {
        await this.db.put('pending', {
          ...change,
          retries,
          lastError: error,
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Obtiene cantidad de cambios pendientes
   */
  async getPendingCount() {
    if (!this.db) await this.init();
    
    const pending = await this.db.getAll('pending');
    const pendingFotos = await this.db.getAllFromIndex('fotos', 'status', 'pending');
    
    return pending.length + pendingFotos.length;
  }

  /**
   * Guarda respuesta en caché
   */
  async cacheResponse(url, data, ttl = 3600000) { // 1 hora default
    if (!this.db) await this.init();

    await this.db.put('cache', {
      url,
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Obtiene respuesta cacheada
   */
  async getCachedResponse(url) {
    if (!this.db) await this.init();

    const cached = await this.db.get('cache', url);
    
    if (!cached) return null;

    // Verificar si expiró
    if (Date.now() - cached.timestamp > cached.ttl) {
      await this.db.delete('cache', url);
      return null;
    }

    return cached;
  }

  /**
   * Limpia caché expirado
   */
  async cleanExpiredCache() {
    if (!this.db) await this.init();

    const allCached = await this.db.getAll('cache');
    const now = Date.now();

    for (const item of allCached) {
      if (now - item.timestamp > item.ttl) {
        await this.db.delete('cache', item.url);
      }
    }
  }

  /**
   * Registra un listener de eventos de sync
   */
  onSync(listener) {
    this.syncListeners.push(listener);
    
    // Retornar función para remover
    return () => {
      const index = this.syncListeners.indexOf(listener);
      if (index > -1) {
        this.syncListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifica a todos los listeners
   */
  notifyListeners(event) {
    this.syncListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error en sync listener:', error);
      }
    });
  }

  /**
   * Limpia todos los datos locales
   */
  async clearAll() {
    if (!this.db) await this.init();

    await this.db.clear('pending');
    await this.db.clear('facturas');
    await this.db.clear('fotos');
    await this.db.clear('cache');

    localStorage.removeItem('lastSync');
  }
}

// Singleton
export const syncManager = new SyncManager();
export default syncManager;

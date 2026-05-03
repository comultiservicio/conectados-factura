/**
 * Service Worker para Conectados Factura+ PWA
 * Proporciona:
 * - Caching de assets para funcionamiento offline
 * - Sincronización en background
 * - Push notifications
 * - Manejo de fotos/facturas offline
 */

const CACHE_NAME = 'factura-plus-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';
const IMAGE_CACHE = 'images-v1';

// Assets precacheados
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css',
  '/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// URLs de API que deben pasar al network primero
const API_ROUTES = [
  '/api/facturas',
  '/api/auth',
  '/api/sync'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Precache completado');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Error en precache:', err);
      })
  );
});

// Activación - limpieza de caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE && 
                     name !== IMAGE_CACHE;
            })
            .map((name) => {
              console.log('[SW] Eliminando cache antigua:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activado');
        return self.clients.claim();
      })
  );
});

// Intercepción de fetch requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API calls - Network first, then cache
  if (API_ROUTES.some(route => url.pathname.includes(route))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2. Imágenes - Cache first con límite
  if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
    event.respondWith(cacheFirstWithLimit(request, IMAGE_CACHE, 100));
    return;
  }

  // 3. Navigation requests - Cache first con página offline
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirstOrOffline(request));
    return;
  }

  // 4. Assets estáticos - Cache first
  if (request.destination === 'script' || 
      request.destination === 'style' ||
      request.destination === 'font') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 5. Default - Stale while revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Estrategia: Network First
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Guardar en cache si la respuesta es válida
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network falló, usando cache:', request.url);
    const cached = await caches.match(request);
    
    if (cached) {
      return cached;
    }
    
    // Si no hay cache y es API, devolver respuesta offline
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({
          error: 'Sin conexión',
          message: 'No hay conexión a internet. Los datos se sincronizarán cuando haya conexión.',
          offline: true
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    throw error;
  }
}

// Estrategia: Cache First
async function cacheFirst(request, cacheName = DYNAMIC_CACHE) {
  const cached = await caches.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[SW] Fetch falló:', error);
    throw error;
  }
}

// Estrategia: Cache First con límite de tamaño
async function cacheFirstWithLimit(request, cacheName, maxItems) {
  const cached = await caches.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(cacheName);
    
    // Guardar en cache
    cache.put(request, networkResponse.clone());
    
    // Limpiar cache si excede el límite
    trimCache(cacheName, maxItems);
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Error cacheando imagen:', error);
    throw error;
  }
}

// Estrategia: Stale While Revalidate
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then(c => c.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Revalidate falló:', error);
    });
  
  return cached || fetchPromise;
}

// Estrategia: Cache First o Offline Page
async function cacheFirstOrOffline(request) {
  try {
    // Intentar cache primero
    const cached = await caches.match(request);
    if (cached) {
      // Revalidate en background
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(DYNAMIC_CACHE)
              .then(cache => cache.put(request, response));
          }
        })
        .catch(() => {});
      
      return cached;
    }
    
    // Si no está en cache, fetch
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('[SW] Navegación falló, mostrando offline page');
    return caches.match('/offline.html');
  }
}

// Limitar tamaño de cache
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
    console.log('[SW] Cache limpiada:', toDelete.length, 'items eliminados');
  }
}

// ============================================================================
// BACKGROUND SYNC - Sincronización offline
// ============================================================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-facturas') {
    event.waitUntil(syncFacturas());
  } else if (event.tag === 'sync-fotos') {
    event.waitUntil(syncFotos());
  }
});

// Sincronizar facturas pendientes
async function syncFacturas() {
  console.log('[SW] Sincronizando facturas pendientes...');
  
  try {
    // Obtener facturas pendientes del IndexedDB
    const pendingFacturas = await getPendingFacturasFromIndexedDB();
    
    for (const factura of pendingFacturas) {
      try {
        const response = await fetch('/api/facturas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${factura.token}`
          },
          body: JSON.stringify(factura.data)
        });
        
        if (response.ok) {
          await markFacturaAsSynced(factura.localId);
          
          // Notificar a la aplicación
          await notifyClients({
            type: 'FACTURA_SYNCED',
            localId: factura.localId,
            serverId: (await response.json()).id
          });
        }
      } catch (err) {
        console.error('[SW] Error sincronizando factura:', err);
      }
    }
  } catch (error) {
    console.error('[SW] Error en sync de facturas:', error);
  }
}

// Sincronizar fotos pendientes
async function syncFotos() {
  console.log('[SW] Sincronizando fotos pendientes...');
  
  try {
    const pendingFotos = await getPendingFotosFromIndexedDB();
    
    for (const foto of pendingFotos) {
      try {
        const formData = new FormData();
        formData.append('file', foto.blob, foto.filename);
        formData.append('facturaId', foto.facturaId);
        
        const response = await fetch('/api/fotos/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${foto.token}`
          },
          body: formData
        });
        
        if (response.ok) {
          await markFotoAsSynced(foto.localId);
        }
      } catch (err) {
        console.error('[SW] Error sincronizando foto:', err);
      }
    }
  } catch (error) {
    console.error('[SW] Error en sync de fotos:', error);
  }
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido:', event);
  
  const data = event.data.json();
  
  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'default',
    requireInteraction: true,
    actions: data.actions || [],
    data: data.payload || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Factura+', options)
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { action, notification } = event;
  const data = notification.data;
  
  if (action === 'view' || !action) {
    event.waitUntil(
      clients.openWindow(data.url || '/')
    );
  } else if (action === 'sync') {
    event.waitUntil(
      self.registration.sync.register('sync-facturas')
    );
  }
});

// ============================================================================
// MESSAGE HANDLING - Comunicación con la app
// ============================================================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_ASSETS':
      event.waitUntil(cacheAssets(payload.urls));
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(clearCaches());
      break;
      
    case 'GET_CACHE_SIZE':
      event.waitUntil(getCacheSize().then(size => {
        event.ports[0].postMessage({ size });
      }));
      break;
      
    case 'REGISTER_SYNC':
      event.waitUntil(
        self.registration.sync.register(payload.tag)
          .then(() => {
            console.log('[SW] Sync registrado:', payload.tag);
            event.ports[0].postMessage({ success: true });
          })
          .catch(err => {
            console.error('[SW] Error registrando sync:', err);
            event.ports[0].postMessage({ success: false, error: err.message });
          })
      );
      break;
  }
});

// Cachear assets específicos
async function cacheAssets(urls) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const promises = urls.map(async (url) => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (err) {
      console.error('[SW] Error cacheando:', url, err);
    }
  });
  await Promise.all(promises);
}

// Limpiar todas las caches
async function clearCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('[SW] Todas las caches limpiadas');
}

// Obtener tamaño de cache
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }
  
  return totalSize;
}

// Notificar a todos los clientes
async function notifyClients(message) {
  const allClients = await clients.matchAll({
    includeUncontrolled: true,
    type: 'window'
  });
  
  for (const client of allClients) {
    client.postMessage(message);
  }
}

// ============================================================================
// INDEXEDDB HELPERS (stubs - implementar según necesidad)
// ============================================================================

async function getPendingFacturasFromIndexedDB() {
  // Implementar con idb-keyval o similar
  // Retorna array de facturas pendientes
  return [];
}

async function markFacturaAsSynced(localId) {
  // Marcar factura como sincronizada en IndexedDB
}

async function getPendingFotosFromIndexedDB() {
  // Retorna array de fotos pendientes
  return [];
}

async function markFotoAsSynced(localId) {
  // Marcar foto como sincronizada
}

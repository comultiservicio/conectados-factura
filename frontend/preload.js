0const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al proceso de renderizado (frontend)
contextBridge.exposeInMainWorld('electronAPI', {
  // Información de la aplicación
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // Actualizaciones
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // Utilidades
  isElectron: true,
  
  // Escuchar eventos del main process
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', callback);
  },
  
  // Remover listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// También exponer una API simplificada para detectar entorno Electron
contextBridge.exposeInMainWorld('isElectron', true);

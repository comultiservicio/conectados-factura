/**
 * Preload Script - Conectados Factura+
 * 
 * Expone APIs seguras al renderer process
 * Todo el acceso a Node.js pasa por aquí
 */

const { contextBridge, ipcRenderer } = require('electron');

// APIs expuestas al frontend
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
  
  // Diálogos
  showMessage: (options) => ipcRenderer.invoke('dialog:show-message', options),
  openExternal: (url) => ipcRenderer.invoke('dialog:open-external', url),
  
  // Eventos del backend
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', callback),
  
  // Utilidades
  platform: process.platform,
  isElectron: true
});

// Para debugging
console.log('[Preload] APIs expuestas a window.electronAPI');

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Determinar si estamos en modo desarrollo
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false, // No mostrar hasta que esté listo
    titleBarStyle: 'default'
  });

  // Cargar la aplicación
  if (isDev) {
    // En desarrollo, cargar desde el servidor de Vite
    mainWindow.loadURL('http://localhost:5173');
    // Abrir DevTools automáticamente en desarrollo
    mainWindow.webContents.openDevTools();
  } else {
    // En producción, cargar el build estático
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Mostrar ventana cuando esté lista para evitar flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Maximizar en pantallas grandes
    if (mainWindow.getBounds().width >= 1400) {
      mainWindow.maximize();
    }
  });

  // Manejar enlaces externos (abrir en navegador por defecto)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Crear ventana cuando la app esté lista
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // En macOS, recrear ventana cuando se hace click en el dock
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cerrar aplicación cuando todas las ventanas están cerradas
app.on('window-all-closed', () => {
  // En macOS, las apps suelen permanecer activas hasta que el usuario presiona Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers para comunicación segura entre frontend y backend
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Manejo de actualizaciones (placeholder para futura implementación)
ipcMain.handle('check-for-updates', async () => {
  // Aquí se implementaría la lógica de auto-updater
  return { updateAvailable: false, version: app.getVersion() };
});

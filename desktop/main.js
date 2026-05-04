/**
 * Conectados Factura+ - Electron Main Process
 * 
 * Estructura:
 * - main.js: Proceso principal Electron
 * - Preload: Comunicación segura entre main y renderer
 * - Auto-updater: Sistema de actualizaciones
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Importar updater
let AutoUpdater;
try {
  AutoUpdater = require('./src/updater/updater');
} catch (e) {
  console.log('Updater no disponible en desarrollo');
}

// Configuración
const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3001;
const FRONTEND_DEV_URL = 'http://localhost:5173';

let mainWindow;
let backendProcess;

/**
 * Crear ventana principal
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Conectados Factura+',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    show: false, // Mostrar cuando esté lista
    titleBarStyle: 'default'
  });

  // Cargar frontend
  if (isDev) {
    mainWindow.loadURL(FRONTEND_DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // En producción, el backend sirve el frontend compilado
    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  }

  // Mostrar cuando esté lista
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Inicializar updater
    if (AutoUpdater && !isDev) {
      new AutoUpdater(mainWindow);
    }
  });

  // Manejar cerrar
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Iniciar backend Node.js
 */
function startBackend() {
  const backendPath = path.join(__dirname, '..', 'backend', 'src', 'server.js');
  
  console.log('Iniciando backend...');
  
  backendProcess = spawn('node', [backendPath], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data}`);
    
    // Notificar a renderer cuando backend esté listo
    if (data.toString().includes('Backend listening')) {
      if (mainWindow) {
        mainWindow.webContents.send('backend-ready');
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error] ${data}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend cerrado con código ${code}`);
  });
}

/**
 * Detener backend
 */
function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

/**
 * IPC Handlers
 */
ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:check-updates', async () => {
  if (AutoUpdater) {
    // Delegar al updater
    return { status: 'checking' };
  }
  return { status: 'not-available' };
});

ipcMain.handle('dialog:open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('dialog:show-message', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

/**
 * App Lifecycle
 */
app.whenReady().then(() => {
  // Iniciar backend primero
  startBackend();
  
  // Esperar un momento y crear ventana
  setTimeout(createWindow, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

// Seguridad: Prevenir navegación a URLs externas no autorizadas
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

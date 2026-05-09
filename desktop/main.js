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
const fs = require('fs');

// Importar updater real
const AutoUpdater = require('./src/updater/updater');

// Configuración
const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3001;
const FRONTEND_DEV_URL = 'http://localhost:5173';

let mainWindow;
let backendProcess;
let config = null;
let updater = null;

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
 * Load configuration from config.json or create default
 */
function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  
  // Default config
  const defaultConfig = {
    client_id: 'cliente_local',
    pos_prefix: '0001',
    server_url: `http://localhost:${BACKEND_PORT}`,
    version: app.getVersion(),
    first_run: true
  };

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      config = { ...defaultConfig, ...JSON.parse(fileContent) };
      console.log('[Config] Loaded from', configPath);
    } else {
      // Create default config
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      config = defaultConfig;
      console.log('[Config] Created default at', configPath);
    }
  } catch (error) {
    console.error('[Config] Error loading config:', error);
    config = defaultConfig;
  }

  return config;
}

/**
 * Save configuration
 */
function saveConfig(newConfig) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  config = { ...config, ...newConfig };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

/**
 * Iniciar backend Node.js
 */
function startBackend() {
  const backendPath = isDev 
    ? path.join(__dirname, '..', 'backend', 'src', 'server.js')
    : path.join(process.resourcesPath, 'backend', 'src', 'server.js');
  
  console.log('[Backend] Starting...', backendPath);
  
  // Ensure config is loaded
  const appConfig = loadConfig();
  
  backendProcess = spawn('node', [backendPath], {
    stdio: 'pipe',
    env: { 
      ...process.env, 
      NODE_ENV: isDev ? 'development' : 'production',
      CLIENT_ID: appConfig.client_id,
      POS_PREFIX: appConfig.pos_prefix,
      APP_VERSION: appConfig.version
    }
  });

  backendProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    console.log(`[Backend] ${msg}`);
    
    // Notificar a renderer cuando backend esté listo
    if (msg.includes('listening') || msg.includes('Backend ready')) {
      if (mainWindow) {
        mainWindow.webContents.send('backend-ready');
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error] ${data}`);
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', data.toString());
    }
  });

  backendProcess.on('error', (error) => {
    console.error('[Backend] Failed to start:', error);
    dialog.showErrorBox(
      'Error de Inicio',
      'No se pudo iniciar el servidor backend. Por favor reinstale la aplicación.'
    );
  });

  backendProcess.on('close', (code) => {
    console.log(`[Backend] Closed with code ${code}`);
    if (code !== 0 && code !== null && mainWindow) {
      dialog.showErrorBox(
        'Error Crítico',
        'El servidor se cerró inesperadamente. Reinicie la aplicación.'
      );
    }
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
  if (!updater) {
    updater = new AutoUpdater(mainWindow);
  }
  return updater.checkForUpdates();
});

ipcMain.handle('app:download-update', async () => {
  if (updater) {
    return updater.downloadAndInstall();
  }
  return { success: false, error: 'Updater not initialized' };
});

ipcMain.handle('config:get', () => config);

ipcMain.handle('config:set', (event, newConfig) => {
  return saveConfig(newConfig);
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
  // Single instance lock
  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    dialog.showErrorBox('Ya en ejecución', 'Conectados Factura+ ya está abierto.');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Iniciar backend primero
  startBackend();
  
  // Esperar a que backend esté listo
  let attempts = 0;
  const checkBackend = setInterval(() => {
    attempts++;
    if (attempts > 30) { // 30 segundos máximo
      clearInterval(checkBackend);
      dialog.showErrorBox(
        'Timeout',
        'El servidor no respondió a tiempo. Verifique que no haya otra instancia en ejecución.'
      );
      app.quit();
    }
    
    // Crear ventana cuando esté listo
    if (!mainWindow) {
      createWindow();
      clearInterval(checkBackend);
    }
  }, 1000);

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

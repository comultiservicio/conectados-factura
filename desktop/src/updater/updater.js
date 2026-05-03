/**
 * Sistema de Actualizaciones Automáticas
 * Conectados Factura+ Desktop
 * 
 * Funcionalidad:
 * - Checkear versión contra servidor central
 * - Descargar solo archivos modificados (delta updates)
 * - Instalar en segundo plano
 * - Rollback automático si falla
 */

const { app, dialog, ipcMain } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

class AutoUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.updateServerUrl = process.env.UPDATE_SERVER || 'https://updates.conectados-factura.com';
    this.currentVersion = app.getVersion();
    this.updateDir = path.join(app.getPath('userData'), 'updates');
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    this.appPath = app.getAppPath();
    
    this.updateInfo = null;
    this.downloadProgress = 0;
    this.isUpdating = false;
    
    this.init();
  }

  async init() {
    // Crear directorios necesarios
    await this.ensureDir(this.updateDir);
    await this.ensureDir(this.backupDir);
    
    // Configurar IPC handlers
    this.setupIpcHandlers();
    
    // Auto-check al iniciar (si está habilitado)
    const autoCheck = await this.getSetting('autoCheckUpdates', true);
    if (autoCheck) {
      setTimeout(() => this.checkForUpdates(), 10000); // Check después de 10s
    }
    
    console.log('[Updater] Inicializado v' + this.currentVersion);
  }

  /**
   * Verifica si hay actualizaciones disponibles
   */
  async checkForUpdates(silent = true) {
    try {
      console.log('[Updater] Verificando actualizaciones...');
      
      const platform = process.platform;
      const arch = process.arch;
      
      const checkUrl = `${this.updateServerUrl}/api/updates/check?version=${this.currentVersion}&platform=${platform}&arch=${arch}`;
      
      const response = await this.httpRequest(checkUrl);
      const updateInfo = JSON.parse(response);
      
      if (updateInfo.hasUpdate) {
        console.log('[Updater] Actualización disponible:', updateInfo.version);
        this.updateInfo = updateInfo;
        
        if (!silent) {
          this.notifyUpdateAvailable(updateInfo);
        }
        
        return {
          hasUpdate: true,
          version: updateInfo.version,
          releaseNotes: updateInfo.releaseNotes,
          size: updateInfo.totalSize,
          mandatory: updateInfo.mandatory || false
        };
      } else {
        console.log('[Updater] No hay actualizaciones disponibles');
        
        if (!silent) {
          this.notifyNoUpdate();
        }
        
        return { hasUpdate: false };
      }
    } catch (error) {
      console.error('[Updater] Error verificando actualizaciones:', error);
      
      if (!silent) {
        this.notifyError('No se pudo verificar actualizaciones', error.message);
      }
      
      return { hasUpdate: false, error: error.message };
    }
  }

  /**
   * Descarga e instala la actualización
   */
  async downloadAndInstall() {
    if (!this.updateInfo) {
      throw new Error('No hay información de actualización disponible');
    }

    if (this.isUpdating) {
      throw new Error('Ya hay una actualización en progreso');
    }

    this.isUpdating = true;
    
    try {
      this.notifyProgress({
        stage: 'downloading',
        progress: 0,
        message: 'Descargando actualización...'
      });

      // 1. Descargar manifest de archivos
      const manifest = await this.downloadManifest();
      
      // 2. Calcular qué archivos necesitan actualización
      const filesToUpdate = await this.calculateDelta(manifest);
      
      if (filesToUpdate.length === 0) {
        console.log('[Updater] No hay archivos para actualizar');
        this.isUpdating = false;
        return { success: true, noChanges: true };
      }

      console.log(`[Updater] Descargando ${filesToUpdate.length} archivos...`);

      // 3. Descargar archivos modificados
      const updateFilesDir = path.join(this.updateDir, this.updateInfo.version);
      await this.ensureDir(updateFilesDir);

      let downloadedSize = 0;
      const totalSize = filesToUpdate.reduce((sum, f) => sum + f.size, 0);

      for (let i = 0; i < filesToUpdate.length; i++) {
        const file = filesToUpdate[i];
        
        await this.downloadFile(
          file.url,
          path.join(updateFilesDir, file.path),
          (bytesDownloaded) => {
            downloadedSize += bytesDownloaded;
            const progress = Math.round((downloadedSize / totalSize) * 100);
            this.notifyProgress({
              stage: 'downloading',
              progress,
              message: `Descargando ${i + 1} de ${filesToUpdate.length} archivos...`,
              detail: file.path
            });
          }
        );
      }

      // 4. Verificar integridad de archivos descargados
      this.notifyProgress({
        stage: 'verifying',
        progress: 95,
        message: 'Verificando integridad...'
      });

      const verified = await this.verifyFiles(updateFilesDir, filesToUpdate);
      if (!verified) {
        throw new Error('La verificación de integridad falló');
      }

      // 5. Crear backup de la versión actual
      this.notifyProgress({
        stage: 'backup',
        progress: 98,
        message: 'Creando backup...'
      });

      const backupPath = await this.createBackup();

      // 6. Aplicar actualización
      this.notifyProgress({
        stage: 'installing',
        progress: 99,
        message: 'Instalando actualización...'
      });

      await this.applyUpdate(updateFilesDir);

      // 7. Guardar info de la actualización
      await this.saveUpdateInfo({
        version: this.updateInfo.version,
        installedAt: new Date().toISOString(),
        backupPath,
        filesUpdated: filesToUpdate.map(f => f.path)
      });

      this.notifyProgress({
        stage: 'completed',
        progress: 100,
        message: 'Actualización completada. Reiniciando...'
      });

      // Notificar éxito
      this.notifySuccess(this.updateInfo.version);

      // Reiniciar aplicación después de un delay
      setTimeout(() => {
        this.restartApp();
      }, 2000);

      return { success: true, version: this.updateInfo.version };

    } catch (error) {
      console.error('[Updater] Error en actualización:', error);
      
      // Intentar rollback si es posible
      await this.rollback();
      
      this.notifyError('Error al actualizar', error.message);
      this.isUpdating = false;
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Descarga el manifest de archivos
   */
  async downloadManifest() {
    const manifestUrl = `${this.updateServerUrl}/api/updates/manifest?version=${this.updateInfo.version}`;
    const response = await this.httpRequest(manifestUrl);
    return JSON.parse(response);
  }

  /**
   * Calcula qué archivos necesitan actualización (delta)
   */
  async calculateDelta(manifest) {
    const filesToUpdate = [];

    for (const file of manifest.files) {
      const localPath = path.join(this.appPath, file.path);
      
      // Verificar si el archivo existe localmente
      if (!fsSync.existsSync(localPath)) {
        filesToUpdate.push(file);
        continue;
      }

      // Calcular hash del archivo local
      const localHash = await this.calculateFileHash(localPath);
      
      // Si el hash es diferente, necesita actualización
      if (localHash !== file.hash) {
        filesToUpdate.push(file);
      }
    }

    return filesToUpdate;
  }

  /**
   * Calcula hash SHA256 de un archivo
   */
  async calculateFileHash(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Descarga un archivo con progreso
   */
  async downloadFile(url, destPath, onProgress) {
    await this.ensureDir(path.dirname(destPath));
    
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      
      const request = client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const file = fsSync.createWriteStream(destPath);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) onProgress(chunk.length);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      request.on('error', reject);
      request.setTimeout(60000, () => {
        request.abort();
        reject(new Error('Timeout de descarga'));
      });
    });
  }

  /**
   * Verifica integridad de archivos descargados
   */
  async verifyFiles(updateDir, files) {
    for (const file of files) {
      const filePath = path.join(updateDir, file.path);
      
      if (!fsSync.existsSync(filePath)) {
        console.error('[Updater] Archivo faltante:', file.path);
        return false;
      }

      const hash = await this.calculateFileHash(filePath);
      if (hash !== file.hash) {
        console.error('[Updater] Hash no coincide:', file.path);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Crea backup de la versión actual
   */
  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, timestamp);
    
    await this.ensureDir(backupPath);

    // Copiar archivos principales (no todo node_modules)
    const criticalPaths = [
      'package.json',
      'main.js',
      'preload.js',
      'src',
      'dist'
    ];

    for (const cp of criticalPaths) {
      const srcPath = path.join(this.appPath, cp);
      const destPath = path.join(backupPath, cp);
      
      if (fsSync.existsSync(srcPath)) {
        await this.copyRecursive(srcPath, destPath);
      }
    }

    // Guardar metadata
    await fs.writeFile(
      path.join(backupPath, 'backup-meta.json'),
      JSON.stringify({
        version: this.currentVersion,
        createdAt: new Date().toISOString(),
        paths: criticalPaths
      }, null, 2)
    );

    console.log('[Updater] Backup creado:', backupPath);
    return backupPath;
  }

  /**
   * Aplica la actualización
   */
  async applyUpdate(updateFilesDir) {
    // Copiar archivos actualizados al directorio de la app
    const copyRecursive = async (src, dest) => {
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      await this.ensureDir(dest);
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          await copyRecursive(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    };

    await copyRecursive(updateFilesDir, this.appPath);
  }

  /**
   * Rollback a versión anterior si la actualización falla
   */
  async rollback() {
    try {
      console.log('[Updater] Iniciando rollback...');
      
      // Buscar backup más reciente
      const backups = await fs.readdir(this.backupDir);
      if (backups.length === 0) {
        console.error('[Updater] No hay backups disponibles');
        return false;
      }

      // Ordenar por fecha (más reciente primero)
      backups.sort().reverse();
      const latestBackup = path.join(this.backupDir, backups[0]);

      // Restaurar archivos
      const copyRecursive = async (src, dest) => {
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name === 'backup-meta.json') continue;
          
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            await copyRecursive(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      };

      await copyRecursive(latestBackup, this.appPath);
      
      console.log('[Updater] Rollback completado desde:', latestBackup);
      return true;
    } catch (error) {
      console.error('[Updater] Error en rollback:', error);
      return false;
    }
  }

  /**
   * Reinicia la aplicación
   */
  restartApp() {
    app.relaunch();
    app.exit(0);
  }

  /**
   * Guarda información de la actualización
   */
  async saveUpdateInfo(info) {
    const updateHistoryPath = path.join(app.getPath('userData'), 'update-history.json');
    let history = [];
    
    try {
      const existing = await fs.readFile(updateHistoryPath, 'utf8');
      history = JSON.parse(existing);
    } catch (e) {
      // No existe historial
    }
    
    history.push(info);
    
    // Mantener solo últimas 10 actualizaciones
    if (history.length > 10) {
      history = history.slice(-10);
    }
    
    await fs.writeFile(updateHistoryPath, JSON.stringify(history, null, 2));
  }

  /**
   * Configurar IPC handlers para comunicación con renderer
   */
  setupIpcHandlers() {
    // Verificar actualizaciones (manual)
    ipcMain.handle('updater:check', async () => {
      return await this.checkForUpdates(false);
    });

    // Iniciar descarga e instalación
    ipcMain.handle('updater:download-and-install', async () => {
      return await this.downloadAndInstall();
    });

    // Obtener historial de actualizaciones
    ipcMain.handle('updater:history', async () => {
      try {
        const updateHistoryPath = path.join(app.getPath('userData'), 'update-history.json');
        const content = await fs.readFile(updateHistoryPath, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        return [];
      }
    });

    // Configuración
    ipcMain.handle('updater:setting', async (event, key, value) => {
      return await this.setSetting(key, value);
    });

    ipcMain.handle('updater:get-setting', async (event, key, defaultValue) => {
      return await this.getSetting(key, defaultValue);
    });
  }

  /**
   * Notificaciones al renderer process
   */
  notifyUpdateAvailable(info) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('updater:update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        size: info.totalSize,
        mandatory: info.mandatory
      });
    }
  }

  notifyNoUpdate() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('updater:no-update');
    }
  }

  notifyProgress(data) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('updater:progress', data);
    }
  }

  notifySuccess(version) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('updater:success', { version });
    }
  }

  notifyError(title, message) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('updater:error', { title, message });
    }
  }

  /**
   * Helpers de filesystem
   */
  async ensureDir(dir) {
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async copyRecursive(src, dest) {
    const stats = await fs.stat(src);
    
    if (stats.isDirectory()) {
      await this.ensureDir(dest);
      const entries = await fs.readdir(src);
      
      for (const entry of entries) {
        await this.copyRecursive(
          path.join(src, entry),
          path.join(dest, entry)
        );
      }
    } else {
      await fs.copyFile(src, dest);
    }
  }

  /**
   * HTTP Request helper
   */
  httpRequest(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      
      const req = client.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.abort();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Settings storage
   */
  async getSetting(key, defaultValue = null) {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'updater-settings.json');
      const content = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);
      return settings[key] !== undefined ? settings[key] : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  async setSetting(key, value) {
    const settingsPath = path.join(app.getPath('userData'), 'updater-settings.json');
    let settings = {};
    
    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      settings = JSON.parse(content);
    } catch (e) {
      // No existe aún
    }
    
    settings[key] = value;
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  }
}

module.exports = AutoUpdater;

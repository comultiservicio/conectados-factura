/**
 * Sistema de Backup Automático para Conectados Factura+
 * 
 * Funcionalidades:
 * - Backup diario de SQLite con timestamp
 * - Compresión ZIP
 * - Encriptación AES-256
 * - Subida a servidor local (192.168.15.80)
 * - Logs detallados de operaciones
 * - Verificación de integridad
 * - Notificación por email si falla
 * 
 * @module services/backupManager
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');
const nodemailer = require('nodemailer');

class BackupManager {
  constructor() {
    // Configuración desde environment variables
    this.config = {
      // Rutas
      dbPath: process.env.DB_PATH || path.join(__dirname, '../../data/factura.db'),
      backupDir: process.env.BACKUP_DIR || path.join(__dirname, '../../backups'),
      logsDir: process.env.LOGS_DIR || path.join(__dirname, '../../logs'),
      
      // Servidor de backup remoto
      remoteServer: process.env.BACKUP_SERVER || 'http://192.168.15.80:8080',
      remoteEndpoint: process.env.BACKUP_ENDPOINT || '/api/backups/upload',
      apiKey: process.env.BACKUP_API_KEY || '',
      
      // Encriptación
      encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || this.generateKeyFromPassword(
        process.env.BACKUP_PASSWORD || 'conectados-backup-2024'
      ),
      
      // Retención
      localRetention: parseInt(process.env.BACKUP_LOCAL_RETENTION) || 7, // días
      remoteRetention: parseInt(process.env.BACKUP_REMOTE_RETENTION) || 30,
      
      // Email para notificaciones
      email: {
        smtp: {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
          }
        },
        from: process.env.EMAIL_FROM || 'backup@conectados-factura.com',
        to: process.env.EMAIL_TO || 'admin@conectados-factura.com'
      },
      
      // Scheduling
      schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // 2 AM daily
      
      // Verificación
      verifyBackups: process.env.BACKUP_VERIFY !== 'false'
    };

    this.transporter = null;
    this.init();
  }

  /**
   * Inicializa el gestor de backups
   */
  async init() {
    try {
      // Crear directorios necesarios
      await this.ensureDir(this.config.backupDir);
      await this.ensureDir(this.config.logsDir);
      
      // Configurar email si hay credenciales
      if (this.config.email.smtp.auth.user) {
        this.transporter = nodemailer.createTransporter(this.config.email.smtp);
      }
      
      this.log('INFO', 'BackupManager inicializado', {
        dbPath: this.config.dbPath,
        backupDir: this.config.backupDir,
        remoteServer: this.config.remoteServer
      });
    } catch (error) {
      this.log('ERROR', 'Error inicializando BackupManager', { error: error.message });
      throw error;
    }
  }

  /**
   * Ejecuta el proceso completo de backup
   */
  async runBackup() {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    this.log('INFO', 'Iniciando proceso de backup', { timestamp });
    
    try {
      // 1. Verificar base de datos
      await this.verifyDatabase();
      
      // 2. Crear backup SQLite nativo
      const backupFile = await this.createSQLiteBackup(timestamp);
      
      // 3. Comprimir
      const zipFile = await this.compressBackup(backupFile, timestamp);
      
      // 4. Encriptar
      const encryptedFile = await this.encryptBackup(zipFile, timestamp);
      
      // 5. Verificar integridad
      if (this.config.verifyBackups) {
        await this.verifyBackup(encryptedFile, timestamp);
      }
      
      // 6. Subir a servidor remoto
      const uploadResult = await this.uploadToRemote(encryptedFile, timestamp);
      
      // 7. Limpiar backups antiguos
      await this.cleanupOldBackups();
      
      const duration = Date.now() - startTime;
      const stats = await this.getBackupStats(encryptedFile);
      
      this.log('SUCCESS', 'Backup completado exitosamente', {
        timestamp,
        duration: `${duration}ms`,
        originalSize: stats.originalSize,
        compressedSize: stats.compressedSize,
        encryptedSize: stats.encryptedSize,
        remoteId: uploadResult.id
      });
      
      return {
        success: true,
        timestamp,
        file: path.basename(encryptedFile),
        duration,
        stats,
        remoteId: uploadResult.id
      };
      
    } catch (error) {
      this.log('ERROR', 'Error en proceso de backup', {
        timestamp,
        error: error.message,
        stack: error.stack
      });
      
      // Enviar notificación de fallo
      await this.sendFailureNotification(error, timestamp);
      
      throw error;
    }
  }

  /**
   * Crea backup nativo de SQLite
   */
  async createSQLiteBackup(timestamp) {
    this.log('INFO', 'Creando backup SQLite nativo', { timestamp });
    
    const backupFile = path.join(this.config.backupDir, `factura_backup_${timestamp}.db`);
    
    return new Promise((resolve, reject) => {
      // Usar comando sqlite3 para backup nativo
      const sqlite3 = spawn('sqlite3', [
        this.config.dbPath,
        `.backup '${backupFile}'`
      ]);
      
      let stderr = '';
      
      sqlite3.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      sqlite3.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`SQLite backup failed: ${stderr}`));
        } else {
          this.log('INFO', 'Backup SQLite creado', { file: backupFile });
          resolve(backupFile);
        }
      });
      
      sqlite3.on('error', (error) => {
        reject(new Error(`Failed to spawn sqlite3: ${error.message}`));
      });
    });
  }

  /**
   * Comprime el backup con ZIP
   */
  async compressBackup(backupFile, timestamp) {
    this.log('INFO', 'Comprimiendo backup', { timestamp });
    
    const zipFile = path.join(this.config.backupDir, `factura_backup_${timestamp}.zip`);
    
    return new Promise((resolve, reject) => {
      const zip = spawn('zip', [
        '-j', // No guardar path de directorios
        '-9', // Máxima compresión
        zipFile,
        backupFile
      ]);
      
      let stderr = '';
      
      zip.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      zip.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`ZIP compression failed: ${stderr}`));
        } else {
          // Eliminar archivo original no comprimido
          await fs.unlink(backupFile);
          this.log('INFO', 'Backup comprimido', { file: zipFile });
          resolve(zipFile);
        }
      });
      
      zip.on('error', (error) => {
        reject(new Error(`Failed to spawn zip: ${error.message}`));
      });
    });
  }

  /**
   * Encripta el backup con AES-256-GCM
   */
  async encryptBackup(zipFile, timestamp) {
    this.log('INFO', 'Encriptando backup', { timestamp });
    
    const encryptedFile = path.join(this.config.backupDir, `factura_backup_${timestamp}.enc`);
    
    try {
      // Leer archivo
      const data = await fs.readFile(zipFile);
      
      // Generar IV aleatorio
      const iv = crypto.randomBytes(16);
      
      // Crear cipher
      const cipher = crypto.createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);
      
      // Encriptar
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Escribir: IV + AuthTag + Data
      const output = Buffer.concat([iv, authTag, encrypted]);
      await fs.writeFile(encryptedFile, output);
      
      // Eliminar archivo zip sin encriptar
      await fs.unlink(zipFile);
      
      this.log('INFO', 'Backup encriptado', { file: encryptedFile });
      
      return encryptedFile;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Verifica integridad del backup encriptado
   */
  async verifyBackup(encryptedFile, timestamp) {
    this.log('INFO', 'Verificando integridad del backup', { timestamp });
    
    try {
      // Leer archivo encriptado
      const data = await fs.readFile(encryptedFile);
      
      // Extraer IV, AuthTag y datos encriptados
      const iv = data.slice(0, 16);
      const authTag = data.slice(16, 32);
      const encrypted = data.slice(32);
      
      // Intentar desencriptar (sin guardar)
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.config.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      
      // Verificar que es un ZIP válido (comienza con PK)
      if (decrypted[0] !== 0x50 || decrypted[1] !== 0x4B) {
        throw new Error('El backup desencriptado no es un archivo ZIP válido');
      }
      
      this.log('INFO', 'Verificación de integridad exitosa', { timestamp });
      
      return true;
    } catch (error) {
      throw new Error(`Integrity verification failed: ${error.message}`);
    }
  }

  /**
   * Sube el backup al servidor remoto
   */
  async uploadToRemote(encryptedFile, timestamp) {
    this.log('INFO', 'Subiendo backup a servidor remoto', { 
      timestamp, 
      server: this.config.remoteServer 
    });
    
    try {
      const form = new FormData();
      form.append('backup', fsSync.createReadStream(encryptedFile));
      form.append('timestamp', timestamp);
      form.append('originalName', path.basename(encryptedFile));
      form.append('checksum', await this.calculateChecksum(encryptedFile));
      
      const response = await axios.post(
        `${this.config.remoteServer}${this.config.remoteEndpoint}`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'X-API-Key': this.config.apiKey
          },
          timeout: 60000, // 60 segundos timeout
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      
      this.log('INFO', 'Backup subido exitosamente', {
        timestamp,
        remoteId: response.data.id,
        server: this.config.remoteServer
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Upload failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Limpia backups antiguos según política de retención
   */
  async cleanupOldBackups() {
    this.log('INFO', 'Limpiando backups antiguos');
    
    try {
      const files = await fs.readdir(this.config.backupDir);
      const now = Date.now();
      const maxAge = this.config.localRetention * 24 * 60 * 60 * 1000; // días a ms
      
      let deleted = 0;
      
      for (const file of files) {
        if (!file.endsWith('.enc')) continue;
        
        const filePath = path.join(this.config.backupDir, file);
        const stats = await fs.stat(filePath);
        const age = now - stats.mtime.getTime();
        
        if (age > maxAge) {
          await fs.unlink(filePath);
          deleted++;
          this.log('INFO', 'Backup antiguo eliminado', { file });
        }
      }
      
      this.log('INFO', 'Limpieza completada', { deleted });
    } catch (error) {
      this.log('WARNING', 'Error en limpieza de backups', { error: error.message });
    }
  }

  /**
   * Verifica que la base de datos esté accesible
   */
  async verifyDatabase() {
    if (!fsSync.existsSync(this.config.dbPath)) {
      throw new Error(`Database not found at ${this.config.dbPath}`);
    }
    
    const stats = await fs.stat(this.config.dbPath);
    if (stats.size === 0) {
      throw new Error('Database file is empty');
    }
    
    this.log('INFO', 'Base de datos verificada', {
      path: this.config.dbPath,
      size: stats.size
    });
  }

  /**
   * Calcula checksum SHA-256 de un archivo
   */
  async calculateChecksum(filePath) {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Genera clave de encriptación desde password
   */
  generateKeyFromPassword(password) {
    return crypto.scryptSync(password, 'conectados-salt', 32);
  }

  /**
   * Obtiene estadísticas del backup
   */
  async getBackupStats(encryptedFile) {
    const stats = await fs.stat(encryptedFile);
    const dbStats = await fs.stat(this.config.dbPath);
    
    return {
      originalSize: dbStats.size,
      originalSizeFormatted: this.formatBytes(dbStats.size),
      encryptedSize: stats.size,
      encryptedSizeFormatted: this.formatBytes(stats.size),
      compressionRatio: ((1 - stats.size / dbStats.size) * 100).toFixed(2) + '%'
    };
  }

  /**
   * Formatea bytes a unidades legibles
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Envía notificación de fallo por email
   */
  async sendFailureNotification(error, timestamp) {
    if (!this.transporter) {
      this.log('WARNING', 'No se pudo enviar notificación: email no configurado');
      return;
    }
    
    try {
      await this.transporter.sendMail({
        from: this.config.email.from,
        to: this.config.email.to,
        subject: `🚨 [CRITICAL] Backup Failed - Conectados Factura+`,
        html: `
          <h2>❌ Backup Automático Fallido</h2>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Timestamp:</strong> ${timestamp}</p>
          <p><strong>Error:</strong></p>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${error.message}</pre>
          <p><strong>Stack:</strong></p>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 11px;">${error.stack}</pre>
          <hr>
          <p style="color: #666;">Este es un mensaje automático del sistema de backup.</p>
        `
      });
      
      this.log('INFO', 'Notificación de fallo enviada');
    } catch (emailError) {
      this.log('ERROR', 'Error enviando notificación por email', { error: emailError.message });
    }
  }

  /**
   * Sistema de logging
   */
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...metadata
    };
    
    // Log a consola
    const colors = {
      INFO: '\x1b[36m',    // Cyan
      SUCCESS: '\x1b[32m', // Green
      WARNING: '\x1b[33m', // Yellow
      ERROR: '\x1b[31m'    // Red
    };
    
    const color = colors[level] || '\x1b[0m';
    console.log(`${color}[${level}]\x1b[0m ${message}`, metadata);
    
    // Log a archivo
    const logFile = path.join(this.config.logsDir, `backup-${new Date().toISOString().split('T')[0]}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';
    
    fsSync.appendFile(logFile, logLine, (err) => {
      if (err) console.error('Error escribiendo log:', err);
    });
  }

  /**
   * Obtiene logs de backup
   */
  async getLogs(date = new Date()) {
    const logFile = path.join(
      this.config.logsDir, 
      `backup-${date.toISOString().split('T')[0]}.log`
    );
    
    try {
      const content = await fs.readFile(logFile, 'utf8');
      return content
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
    } catch (error) {
      return [];
    }
  }

  /**
   * Lista backups disponibles
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.config.backupDir);
      const backups = [];
      
      for (const file of files) {
        if (!file.endsWith('.enc')) continue;
        
        const filePath = path.join(this.config.backupDir, file);
        const stats = await fs.stat(filePath);
        
        backups.push({
          filename: file,
          size: stats.size,
          sizeFormatted: this.formatBytes(stats.size),
          createdAt: stats.mtime,
          path: filePath
        });
      }
      
      return backups.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      this.log('ERROR', 'Error listando backups', { error: error.message });
      return [];
    }
  }

  /**
   * Restaura un backup específico
   */
  async restoreBackup(backupFile, targetDbPath = null) {
    const target = targetDbPath || this.config.dbPath;
    
    this.log('INFO', 'Iniciando restauración de backup', {
      backup: backupFile,
      target
    });
    
    try {
      // 1. Desencriptar
      const decryptedFile = await this.decryptBackup(backupFile);
      
      // 2. Descomprimir
      const dbFile = await this.decompressBackup(decryptedFile);
      
      // 3. Verificar integridad del DB
      await this.verifyDatabaseFile(dbFile);
      
      // 4. Backup de la base actual (si existe)
      if (fsSync.existsSync(target)) {
        const currentBackup = `${target}.pre-restore-${Date.now()}`;
        await fs.copyFile(target, currentBackup);
        this.log('INFO', 'Backup de base actual creado', { file: currentBackup });
      }
      
      // 5. Mover el backup restaurado
      await fs.copyFile(dbFile, target);
      
      // 6. Limpiar archivos temporales
      await fs.unlink(decryptedFile);
      await fs.unlink(dbFile);
      
      this.log('SUCCESS', 'Restauración completada', { target });
      
      return { success: true, target };
    } catch (error) {
      this.log('ERROR', 'Error en restauración', { error: error.message });
      throw error;
    }
  }

  /**
   * Desencripta un backup
   */
  async decryptBackup(encryptedFile) {
    const data = await fs.readFile(encryptedFile);
    
    const iv = data.slice(0, 16);
    const authTag = data.slice(16, 32);
    const encrypted = data.slice(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.config.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    const zipFile = encryptedFile.replace('.enc', '.zip');
    await fs.writeFile(zipFile, decrypted);
    
    return zipFile;
  }

  /**
   * Descomprime un backup
   */
  async decompressBackup(zipFile) {
    const outputDir = path.dirname(zipFile);
    
    return new Promise((resolve, reject) => {
      const unzip = spawn('unzip', ['-o', zipFile, '-d', outputDir]);
      
      unzip.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Unzip failed with code ${code}`));
        } else {
          // Encontrar el archivo .db extraído
          const dbFile = zipFile.replace('.zip', '.db');
          resolve(dbFile);
        }
      });
    });
  }

  /**
   * Verifica que un archivo SQLite sea válido
   */
  async verifyDatabaseFile(dbFile) {
    return new Promise((resolve, reject) => {
      const sqlite3 = spawn('sqlite3', [dbFile, 'PRAGMA integrity_check;']);
      
      let output = '';
      sqlite3.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      sqlite3.on('close', (code) => {
        if (code !== 0 || !output.includes('ok')) {
          reject(new Error('Database integrity check failed'));
        } else {
          resolve(true);
        }
      });
    });
  }
}

// Singleton
const backupManager = new BackupManager();

// Si se ejecuta directamente
if (require.main === module) {
  backupManager.runBackup()
    .then(result => {
      console.log('\n✅ Backup completado:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = backupManager;

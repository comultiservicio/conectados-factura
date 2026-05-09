/**
 * Database Module - Inicialización y gestión de base de datos
 * 
 * @description Módulo central para inicialización de SQLite, migraciones,
 * connection pooling y graceful shutdown. Reemplaza connection.js para
 * nuevas implementaciones con mejor manejo de errores.
 * 
 * @version 2.0.0
 * @author Sistema Conectados
 * 
 * CARACTERÍSTICAS:
 * - better-sqlite3 connection
 * - Migration runner automático
 * - Schema validation en startup
 * - Connection pooling (singleton)
 * - Graceful shutdown con cleanup
 * - WAL mode para mejor performance
 * - Foreign keys enforcement
 */

const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.config = {
      databasePath: process.env.DB_PATH || './database/app.db',
      migrationsPath: path.join(__dirname, 'database/migrations'),
      enableWAL: process.env.DB_WAL !== 'false',
      busyTimeout: parseInt(process.env.DB_BUSY_TIMEOUT) || 5000,
      checkpointInterval: parseInt(process.env.DB_CHECKPOINT_INTERVAL) || 300000 // 5 min
    };
    this.checkpointTimer = null;
  }

  /**
   * ========================================================================
   * INICIALIZACIÓN PRINCIPAL
   * ========================================================================
   */

  /**
   * Inicializar base de datos completa
   * @returns {Promise<Database>} Instancia de better-sqlite3
   */
  async initialize() {
    if (this.isConnected && this.db) {
      return this.db;
    }

    try {
      console.log('[DB] Iniciando inicialización de base de datos...');

      // 1. Asegurar directorio
      await this._ensureDirectory();

      // 2. Conectar
      await this._connect();

      // 3. Configurar pragmas
      this._configurePragmas();

      // 4. Ejecutar migraciones
      await this._runMigrations();

      // 5. Validar schema
      await this._validateSchema();

      // 6. Iniciar checkpoint automático
      this._startCheckpointTimer();

      this.isConnected = true;
      console.log('[DB] ✅ Base de datos inicializada correctamente');

      return this.db;

    } catch (error) {
      console.error('[DB] ❌ Error de inicialización:', error);
      throw error;
    }
  }

  /**
   * Obtener instancia de base de datos
   */
  getDatabase() {
    if (!this.db || !this.isConnected) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * ========================================================================
   * CONEXIÓN Y CONFIGURACIÓN
   * ========================================================================
   */

  /**
   * Asegurar que existe el directorio de la base de datos
   * @private
   */
  async _ensureDirectory() {
    const dir = path.dirname(this.config.databasePath);
    
    try {
      await fs.access(dir);
    } catch {
      console.log(`[DB] Creando directorio: ${dir}`);
      await fs.mkdir(dir, { recursive: true });
    }

    // Crear directorios adicionales
    const subdirs = [
      path.join(dir, 'backups'),
      path.join(dir, 'migrations'),
      path.join(dir, 'logs')
    ];

    for (const subdir of subdirs) {
      try {
        await fs.mkdir(subdir, { recursive: true });
      } catch (error) {
        // Ignorar si ya existe
      }
    }
  }

  /**
   * Establecer conexión con SQLite
   * @private
   */
  async _connect() {
    const options = {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
      timeout: this.config.busyTimeout
    };

    this.db = new Database(this.config.databasePath, options);
    
    console.log(`[DB] Conectado a: ${this.config.databasePath}`);
    
    // Configurar WAL mode
    if (this.config.enableWAL) {
      this.db.pragma('journal_mode = WAL');
      console.log('[DB] WAL mode habilitado');
    }
  }

  /**
   * Configurar pragmas de SQLite
   * @private
   */
  _configurePragmas() {
    // Foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Synchronous mode (NORMAL para balance performance/safety)
    this.db.pragma('synchronous = NORMAL');
    
    // Temp store en memory
    this.db.pragma('temp_store = MEMORY');
    
    // Cache size (2000 pages = ~8MB con 4KB pages)
    this.db.pragma('cache_size = 2000');
    
    // mmap size (64MB)
    this.db.pragma('mmap_size = 67108864');
    
    // Busy timeout
    this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
    
    // Case insensitive LIKE
    this.db.pragma('case_sensitive_like = OFF');
    
    console.log('[DB] Pragmas configurados');
  }

  /**
   * ========================================================================
   * MIGRACIONES
   * ========================================================================
   */

  /**
   * Ejecutar migraciones pendientes
   * @private
   */
  async _runMigrations() {
    // Crear tabla de control de migraciones
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER
      )
    `);

    // Obtener migraciones aplicadas
    const appliedMigrations = this.db.prepare(
      'SELECT filename, checksum FROM _migrations'
    ).all();
    
    const appliedMap = new Map(appliedMigrations.map(m => [m.filename, m.checksum]));

    // Leer archivos de migración
    let migrationFiles = [];
    
    try {
      migrationFiles = await fs.readdir(this.config.migrationsPath);
    } catch {
      console.log('[DB] Directorio de migraciones no encontrado, saltando...');
      return;
    }

    // Filtrar archivos .sql y ordenar
    migrationFiles = migrationFiles
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[DB] Encontradas ${migrationFiles.length} migraciones`);

    // Ejecutar migraciones pendientes
    for (const filename of migrationFiles) {
      const filepath = path.join(this.config.migrationsPath, filename);
      const content = await fs.readFile(filepath, 'utf8');
      
      // Calcular checksum simple
      const checksum = this._calculateChecksum(content);
      
      const alreadyApplied = appliedMap.get(filename);
      
      if (alreadyApplied) {
        if (alreadyApplied !== checksum) {
          console.warn(`[DB] ⚠️ Migración ${filename} modificada después de aplicarse`);
          // Continuar pero advertir
        }
        continue;
      }

      console.log(`[DB] Aplicando migración: ${filename}`);
      
      const startTime = Date.now();
      
      try {
        // Ejecutar en transacción
        this.db.exec('BEGIN TRANSACTION');
        this.db.exec(content);
        this.db.exec('COMMIT');
        
        const executionTime = Date.now() - startTime;
        
        // Registrar migración
        this.db.prepare(`
          INSERT INTO _migrations (filename, checksum, execution_time_ms)
          VALUES (?, ?, ?)
        `).run(filename, checksum, executionTime);
        
        console.log(`[DB] ✅ Migración aplicada: ${filename} (${executionTime}ms)`);
        
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw new Error(`Error en migración ${filename}: ${error.message}`);
      }
    }

    console.log('[DB] Migraciones completadas');
  }

  /**
   * Calcular checksum de contenido
   * @private
   */
  _calculateChecksum(content) {
    // Simple hash para detectar cambios
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * ========================================================================
   * VALIDACIÓN DE SCHEMA
   * ========================================================================
   */

  /**
   * Validar que todas las tablas requeridas existen
   * @private
   */
  async _validateSchema() {
    const requiredTables = [
      'users',
      'companies', 
      'products',
      'customers',
      'invoices',
      'invoice_items',
      'stock_movements',
      'cash_closings',
      'cash_movements',
      'afip_pending',
      'afip_logs'
    ];

    const existingTables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name NOT LIKE 'sqlite_%' 
      AND name NOT LIKE '_%'
    `).all().map(t => t.name);

    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      throw new Error(`Tablas requeridas faltantes: ${missingTables.join(', ')}`);
    }

    // Verificar integridad física
    const integrityCheck = this.db.prepare('PRAGMA integrity_check').get();
    
    if (integrityCheck.integrity_check !== 'ok') {
      throw new Error(`Database integrity check failed: ${integrityCheck.integrity_check}`);
    }

    console.log(`[DB] ✅ Schema validado (${requiredTables.length} tablas)`);
    console.log(`[DB] ✅ Integridad física verificada`);
  }

  /**
   * ========================================================================
   * UTILIDADES
   * ========================================================================
   */

  /**
   * Iniciar timer de checkpoint automático
   * @private
   */
  _startCheckpointTimer() {
    if (!this.config.enableWAL) return;

    this.checkpointTimer = setInterval(() => {
      try {
        const result = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
        if (result.log > 0) {
          console.log(`[DB] Checkpoint: ${result.log} frames processed`);
        }
      } catch (error) {
        console.error('[DB] Error en checkpoint:', error);
      }
    }, this.config.checkpointInterval);

    // Unref para no bloquear process.exit
    if (this.checkpointTimer.unref) {
      this.checkpointTimer.unref();
    }
  }

  /**
   * Detener timer de checkpoint
   * @private
   */
  _stopCheckpointTimer() {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
  }

  /**
   * Forzar checkpoint manual
   */
  checkpoint() {
    if (!this.db) return;
    
    const result = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    console.log(`[DB] Checkpoint manual: ${result.log} frames`);
    return result;
  }

  /**
   * Optimizar base de datos
   */
  optimize() {
    if (!this.db) return;
    
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
    console.log('[DB] Optimización completada (VACUUM + ANALYZE)');
  }

  /**
   * Obtener estadísticas de la base de datos
   */
  getStats() {
    if (!this.db) return null;

    const pageCount = this.db.prepare('PRAGMA page_count').get().page_count;
    const pageSize = this.db.prepare('PRAGMA page_size').get().page_size;
    const freelistCount = this.db.prepare('PRAGMA freelist_count').get().freelist_count;
    
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all().length;

    return {
      sizeBytes: pageCount * pageSize,
      sizeMB: ((pageCount * pageSize) / 1024 / 1024).toFixed(2),
      pages: pageCount,
      pageSize,
      freePages: freelistCount,
      tables,
      path: this.config.databasePath,
      walMode: this.db.pragma('journal_mode', { simple: true })
    };
  }

  /**
   * ========================================================================
   * GRACEFUL SHUTDOWN
   * ========================================================================
   */

  /**
   * Cerrar conexión de forma segura
   */
  async close() {
    console.log('[DB] Cerrando conexión de base de datos...');

    try {
      // Detener timer
      this._stopCheckpointTimer();

      // Checkpoint final
      if (this.db && this.config.enableWAL) {
        this.checkpoint();
      }

      // Cerrar conexión
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.isConnected = false;
      console.log('[DB] ✅ Conexión cerrada');

    } catch (error) {
      console.error('[DB] Error cerrando conexión:', error);
      throw error;
    }
  }

  /**
   * Crear backup de la base de datos
   */
  async backup() {
    const backupDir = path.join(path.dirname(this.config.databasePath), 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

    // Asegurar directorio
    await fs.mkdir(backupDir, { recursive: true });

    // VACUUM INTO crea una copia optimizada
    this.db.exec(`VACUUM INTO '${backupPath}'`);

    console.log(`[DB] Backup creado: ${backupPath}`);

    // Verificar backup
    const backupDb = new Database(backupPath, { readonly: true });
    const check = backupDb.prepare('PRAGMA integrity_check').get();
    backupDb.close();

    if (check.integrity_check !== 'ok') {
      await fs.unlink(backupPath);
      throw new Error('Backup integrity check failed');
    }

    console.log('[DB] ✅ Backup verificado');

    return backupPath;
  }
}

// Singleton instance
let instance = null;

/**
 * Obtener instancia singleton del DatabaseManager
 */
function getDatabaseManager() {
  if (!instance) {
    instance = new DatabaseManager();
  }
  return instance;
}

/**
 * Inicializar base de datos (helper function)
 */
async function initializeDatabase() {
  const manager = getDatabaseManager();
  return await manager.initialize();
}

/**
 * Cerrar base de datos (helper function)
 */
async function closeDatabase() {
  const manager = getDatabaseManager();
  return await manager.close();
}

module.exports = {
  DatabaseManager,
  getDatabaseManager,
  initializeDatabase,
  closeDatabase
};

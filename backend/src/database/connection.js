/**
 * Conexión a SQLite - Migración desde DynamoDB
 * @module database/connection
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseConnection {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/factura.db');
  }

  /**
   * Inicializa la conexión a la base de datos
   */
  connect() {
    try {
      // Asegurar que el directorio existe
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Conectar a SQLite con mejoras de rendimiento
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null,
        fileMustExist: false,
      });

      // Activar WAL mode para mejor concurrencia
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');

      console.log('✅ Conectado a SQLite:', this.dbPath);
      return this.db;
    } catch (error) {
      console.error('❌ Error conectando a SQLite:', error);
      throw error;
    }
  }

  /**
   * Cierra la conexión
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('🔒 Conexión SQLite cerrada');
    }
  }

  /**
   * Ejecuta migraciones iniciales
   */
  async runMigrations() {
    const migrations = [
      // Tabla de usuarios
      `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'vendedor', 'chofer', 'contador')),
        name TEXT NOT NULL,
        active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      `,

      // Tabla de facturas (reemplaza DynamoDB)
      `
      CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        cliente TEXT NOT NULL,
        cuit TEXT,
        total REAL NOT NULL,
        items TEXT NOT NULL, -- JSON array
        estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'pagada', 'anulada')),
        vendedor_id INTEGER NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending', 'error')),
        FOREIGN KEY (vendedor_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_facturas_numero ON facturas(numero);
      CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha);
      CREATE INDEX IF NOT EXISTS idx_facturas_vendedor ON facturas(vendedor_id);
      CREATE INDEX IF NOT EXISTS idx_facturas_sync ON facturas(sync_status);
      `,

      // Tabla de productos
      `
      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        categoria TEXT,
        activo BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
      `,

      // Tabla de sync offline
      `
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
        data TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
      `,

      // Triggers para updated_at
      `
      CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
      `,
      `
      CREATE TRIGGER IF NOT EXISTS update_facturas_timestamp 
      AFTER UPDATE ON facturas
      BEGIN
        UPDATE facturas SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
      `
    ];

    for (const migration of migrations) {
      this.db.exec(migration);
    }

    console.log('✅ Migraciones completadas');
  }

  /**
   * Retorna la instancia de la base de datos
   */
  getInstance() {
    if (!this.db) {
      throw new Error('Base de datos no inicializada. Llama a connect() primero.');
    }
    return this.db;
  }
}

// Singleton
module.exports = new DatabaseConnection();

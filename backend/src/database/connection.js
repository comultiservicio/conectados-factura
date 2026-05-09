const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

class DatabaseConnection {
  constructor() {
    this.db = null;
  }

  connect() {
    if (this.db) {
      return this.db;
    }

    const dbPath = config.dbPath;
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.createTables();

    return this.db;
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        avatar TEXT,
        role TEXT NOT NULL DEFAULT 'cashier' CHECK(role IN ('viewer', 'driver', 'cashier', 'manager', 'admin')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions TEXT
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        UNIQUE(user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        razon_social TEXT NOT NULL,
        cuit TEXT UNIQUE,
        direccion TEXT,
        telefono TEXT,
        email TEXT,
        tipo_responsable TEXT CHECK(tipo_responsable IN ('monotributista', 'responsable_inscripto', 'consumidor_final', 'exento')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('A', 'B', 'C', 'NC', 'ND')),
        pos_prefix TEXT DEFAULT '0001',
        full_number TEXT UNIQUE NOT NULL,
        fecha TEXT NOT NULL,
        cliente_nombre TEXT NOT NULL,
        cliente_cuit TEXT,
        items TEXT NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0,
        iva REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        estado TEXT NOT NULL DEFAULT 'borrador',
        tipo_comprobante TEXT CHECK(tipo_comprobante IN ('factura_a', 'factura_b', 'factura_c', 'nota_credito', 'nota_debito', 'remito')),
        punto_venta INTEGER,
        cae TEXT,
        cae_vencimiento TEXT,
        client_id INTEGER,
        user_id INTEGER,
        hash TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        last_sync_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      );

      CREATE TABLE IF NOT EXISTS invoice_sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('A', 'B', 'C', 'NC', 'ND')),
        pos_prefix TEXT NOT NULL DEFAULT '0001',
        last_number INTEGER NOT NULL DEFAULT 0,
        UNIQUE(type, pos_prefix)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        monto REAL NOT NULL,
        categoria TEXT CHECK(categoria IN ('combustible', 'peaje', 'comida', 'mantenimiento', 'otro')) NOT NULL DEFAULT 'otro',
        comprobante_foto TEXT,
        user_id INTEGER,
        trip_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        iva_rate REAL NOT NULL DEFAULT 21,
        stock INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('insert', 'update', 'delete')),
        data TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        action TEXT CHECK(action IN ('insert', 'update', 'delete')) NOT NULL,
        payload TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        client_name TEXT,
        activated_at TEXT,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial', 'active', 'expired', 'revoked')),
        machine_id TEXT
      );
    `);

    this.ensureColumn('users', 'phone', 'TEXT');
    this.ensureColumn('users', 'avatar', 'TEXT');
    this.ensureColumn('facturas', 'tipo_comprobante', "TEXT CHECK(tipo_comprobante IN ('factura_a', 'factura_b', 'factura_c', 'nota_credito', 'nota_debito', 'remito'))");
    this.ensureColumn('facturas', 'punto_venta', 'INTEGER');
    this.ensureColumn('facturas', 'cae', 'TEXT');
    this.ensureColumn('facturas', 'cae_vencimiento', 'TEXT');
    this.ensureColumn('facturas', 'client_id', 'INTEGER');

    // Campos AFIP para integración WSFEv1
    this.ensureColumn('facturas', 'afip_status', "TEXT DEFAULT 'pending' CHECK(afip_status IN ('pending', 'authorized', 'failed', 'manual'))");
    this.ensureColumn('facturas', 'afip_cae', 'TEXT');
    this.ensureColumn('facturas', 'afip_cae_due_date', 'DATE');
    this.ensureColumn('facturas', 'afip_response_date', 'DATETIME');
    this.ensureColumn('facturas', 'afip_error', 'TEXT');
    this.ensureColumn('facturas', 'afip_request_count', 'INTEGER DEFAULT 0');

    this.seedRoles();
    this.runMigrations();
  }

  ensureColumn(tableName, columnName, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasColumn = columns.some((column) => column.name === columnName);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  /**
   * Ejecutar migraciones SQL pendientes
   * Sistema simple de migraciones basado en archivos numerados
   */
  runMigrations() {
    const fs = require('fs');
    const path = require('path');
    
    // Crear tabla de migraciones si no existe
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        filename TEXT UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[DB] No migrations directory found');
      return;
    }

    // Obtener migraciones ya ejecutadas
    const executed = this.db.prepare('SELECT filename FROM migrations').all().map(r => r.filename);
    
    // Leer archivos de migración
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (executed.includes(file)) continue;

      try {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        // Ejecutar migración en transacción
        this.db.transaction(() => {
          this.db.exec(sql);
          this.db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
        })();

        console.log(`✅ Migration applied: ${file}`);
      } catch (error) {
        console.error(`❌ Migration failed: ${file}`, error.message);
        // No lanzar error para no bloquear arranque
      }
    }
  }

  seedRoles() {
    // Nuevo sistema de roles unificado (5 roles)
    const roles = [
      { name: 'admin', description: 'Acceso total, configuracion, usuarios', permissions: '{"all":true}' },
      { name: 'manager', description: 'Reportes, analisis, no modifica config', permissions: '{"reports":true,"analytics":true,"read_all":true}' },
      { name: 'cashier', description: 'Ventas, stock consulta, cierre de caja', permissions: '{"sales":true,"stock_read":true,"cash_register":true}' },
      { name: 'driver', description: 'Ventas movil, OCR, sync offline', permissions: '{"mobile_sales":true,"ocr":true,"offline_sync":true}' },
      { name: 'viewer', description: 'Solo lectura', permissions: '{"read_only":true}' }
    ];

    const insertRole = this.db.prepare(`
      INSERT OR IGNORE INTO roles (name, description, permissions)
      VALUES (?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      items.forEach((role) => {
        insertRole.run(role.name, role.description, role.permissions);
      });
    });

    insertMany(roles);

    // Initialize invoice sequences for default POS
    const sequences = [
      ['A', '0001', 0],
      ['B', '0001', 0],
      ['C', '0001', 0]
    ];
    const insertSeq = this.db.prepare(`
      INSERT OR IGNORE INTO invoice_sequences (type, pos_prefix, last_number)
      VALUES (?, ?, ?)
    `);
    sequences.forEach(([type, prefix, num]) => insertSeq.run(type, prefix, num));

    // Create default admin user (admin@local.com / admin123)
    const bcrypt = require('bcryptjs');
    const defaultEmail = 'admin@local.com';
    const existingAdmin = this.db.prepare('SELECT id FROM users WHERE email = ?').get(defaultEmail);
    
    if (!existingAdmin) {
      const passwordHash = bcrypt.hashSync('admin123', 10);
      this.db.prepare(`
        INSERT INTO users (email, password_hash, name, role, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(defaultEmail, passwordHash, 'Administrador', 'admin');
      console.log('✅ Default admin user created: admin@local.com / admin123');
      console.log('   Role: admin (sistema unificado de 5 roles)');
    }
  }

  getInstance() {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }
}

module.exports = new DatabaseConnection();
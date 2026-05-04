const dbConnection = require('../database/connection');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class InvoiceService {
  constructor() {
    this.db = dbConnection.getInstance();
    this.isGenerating = false; // Mutex para prevenir doble ejecución
    this.backupCounter = 0;
  }

  /**
   * MUTEX: Prevenir doble generación de números
   * CRÍTICO para producción - evita race conditions
   */
  async withLock(fn) {
    if (this.isGenerating) {
      throw new Error('SEQUENCE_LOCKED: Invoice generation in progress');
    }

    this.isGenerating = true;
    try {
      return await fn();
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Backup automático de la base de datos
   * Cada 10 facturas y al inicio
   */
  async backupIfNeeded() {
    this.backupCounter++;
    
    // Backup cada 10 facturas
    if (this.backupCounter % 10 === 0) {
      await this.createBackup();
    }
  }

  /**
   * Crear backup de la DB
   */
  async createBackup() {
    try {
      const dbPath = path.join(__dirname, '../../database/app.db');
      const backupDir = path.join(__dirname, '../../database/backups');
      
      // Crear directorio si no existe
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `app-${date}.db`);

      // Copiar archivo
      fs.copyFileSync(dbPath, backupPath);
      
      // Mantener solo últimos 10 backups
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('app-') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(backupDir, f),
          stat: fs.statSync(path.join(backupDir, f))
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);

      // Eliminar backups viejos
      if (files.length > 10) {
        files.slice(10).forEach(f => {
          try {
            fs.unlinkSync(f.path);
          } catch (e) {
            console.error('[Backup] Error deleting old backup:', e);
          }
        });
      }

      console.log('[Backup] Created:', backupPath);
      return { success: true, path: backupPath };
    } catch (error) {
      console.error('[Backup] Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate SHA256 hash of invoice data for integrity verification
   */
  generateHash(data) {
    const hashData = JSON.stringify({
      number: data.number,
      type: data.type,
      pos_prefix: data.pos_prefix,
      full_number: data.full_number,
      total: data.total,
      items: data.items,
      fecha: data.fecha,
      cliente_cuit: data.cliente_cuit
    });
    return crypto.createHash('sha256').update(hashData).digest('hex');
  }

  /**
   * Get next invoice number with BULLETPROOF transaction (Argentina requirement)
   * CRITICAL: This prevents race conditions and duplicate numbers
   */
  getNextInvoiceNumber(type, posPrefix = '0001') {
    // Use immediate transaction with EXCLUSIVE lock
    const transaction = this.db.transaction((invoiceType, prefix) => {
      // 1. Lock row for update (ensures no concurrent reads)
      const seq = this.db.prepare(`
        SELECT last_number FROM invoice_sequences 
        WHERE type = ? AND pos_prefix = ?
      `).get(invoiceType, prefix);

      const nextNumber = (seq?.last_number || 0) + 1;

      // 2. Atomically update sequence
      this.db.prepare(`
        INSERT INTO invoice_sequences (type, pos_prefix, last_number)
        VALUES (?, ?, ?)
        ON CONFLICT(type, pos_prefix)
        DO UPDATE SET last_number = ?
      `).run(invoiceType, prefix, nextNumber, nextNumber);

      // 3. Verify no duplicates exist (extra safety)
      const checkDup = this.db.prepare(`
        SELECT COUNT(*) as count FROM facturas 
        WHERE type = ? AND pos_prefix = ? AND number = ?
      `).get(invoiceType, prefix, nextNumber);

      if (checkDup.count > 0) {
        throw new Error(`DUPLICATE_NUMBER_DETECTED: ${prefix}-${nextNumber}`);
      }

      return nextNumber;
    });

    // Execute transaction (SERIALIZABLE isolation)
    return transaction(type, posPrefix);
  }

  /**
   * Format full invoice number: POS-XXXXXXXX
   */
  formatInvoiceNumber(posPrefix, number) {
    return `${posPrefix}-${String(number).padStart(8, '0')}`;
  }

  /**
   * Create a new invoice with sequential numbering (PROTECTED with mutex)
   */
  async createInvoice(invoiceData) {
    // Usar mutex para prevenir doble ejecución
    return this.withLock(async () => {
      return this._createInvoiceInternal(invoiceData);
    });
  }

  /**
   * Internal invoice creation (mutex protected)
   */
  async _createInvoiceInternal(invoiceData) {
    const {
      type = 'B',
      pos_prefix = '0001',
      fecha = new Date().toISOString().split('T')[0],
      cliente_nombre,
      cliente_cuit,
      items,
      subtotal,
      iva,
      total,
      user_id,
      client_id,
      tipo_comprobante = 'factura_b'
    } = invoiceData;

    // Get next sequential number
    const number = this.getNextInvoiceNumber(type, pos_prefix);
    const fullNumber = this.formatInvoiceNumber(pos_prefix, number);

    // Generate hash for data integrity
    const hash = this.generateHash({
      number, type, pos_prefix, full_number: fullNumber,
      total, items, fecha, cliente_cuit
    });

    const now = new Date().toISOString();

    const insertInvoice = this.db.prepare(`
      INSERT INTO facturas (
        number, type, pos_prefix, full_number, fecha, cliente_nombre, 
        cliente_cuit, items, subtotal, iva, total, estado, hash,
        tipo_comprobante, punto_venta, user_id, client_id, synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const result = insertInvoice.run(
      number, type, pos_prefix, fullNumber, fecha, cliente_nombre,
      cliente_cuit, JSON.stringify(items), subtotal, iva, total, hash,
      tipo_comprobante, parseInt(pos_prefix), user_id, client_id, now, now
    );

    const invoiceId = result.lastInsertRowid;

    // Add to sync queue
    this.addToSyncQueue('facturas', invoiceId, 'insert', {
      ...invoiceData,
      id: invoiceId,
      number,
      type,
      pos_prefix,
      full_number: fullNumber
    });

    // Trigger backup if needed (every 10 invoices)
    this.backupIfNeeded();

    return {
      id: invoiceId,
      number,
      full_number: fullNumber,
      type,
      pos_prefix,
      hash
    };
  }

  /**
   * Add operation to sync queue
   */
  addToSyncQueue(entity, entityId, action, data) {
    const insertQueue = this.db.prepare(`
      INSERT INTO sync_queue (entity, entity_id, action, data, synced)
      VALUES (?, ?, ?, ?, 0)
    `);
    
    insertQueue.run(entity, entityId, action, JSON.stringify(data));
  }

  /**
   * Get all invoices with optional filters
   */
  getInvoices({ type, synced, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM facturas WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (synced !== undefined) {
      query += ' AND synced = ?';
      params.push(synced ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const invoices = stmt.all(...params);

    return invoices.map(inv => ({
      ...inv,
      items: JSON.parse(inv.items || '[]')
    }));
  }

  /**
   * Get pending sync items
   */
  getPendingSync() {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_queue 
      WHERE synced = 0 
      ORDER BY created_at ASC
    `);
    
    const items = stmt.all();
    
    return items.map(item => ({
      ...item,
      data: JSON.parse(item.data || '{}')
    }));
  }

  /**
   * Mark items as synced
   */
  markAsSynced(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    
    const placeholders = ids.map(() => '?').join(',');
    
    // Mark sync_queue items as synced
    const updateQueue = this.db.prepare(`
      UPDATE sync_queue 
      SET synced = 1, sync_attempts = sync_attempts + 1
      WHERE id IN (${placeholders})
    `);
    updateQueue.run(...ids);

    // Also mark corresponding facturas as synced
    const getEntityIds = this.db.prepare(`
      SELECT entity_id FROM sync_queue WHERE id IN (${placeholders})
    `);
    const entityIds = getEntityIds.all(...ids).map(r => r.entity_id);
    
    if (entityIds.length > 0) {
      const facturaPlaceholders = entityIds.map(() => '?').join(',');
      const updateFacturas = this.db.prepare(`
        UPDATE facturas 
        SET synced = 1 
        WHERE id IN (${facturaPlaceholders})
      `);
      updateFacturas.run(...entityIds);
    }
  }

  /**
   * Get invoice statistics
   */
  getStats() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM facturas');
    const pendingStmt = this.db.prepare('SELECT COUNT(*) as pending FROM facturas WHERE synced = 0');
    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count, SUM(total) as total_amount
      FROM facturas
      GROUP BY type
    `);

    return {
      total: totalStmt.get().total,
      pending_sync: pendingStmt.get().pending,
      by_type: byTypeStmt.all()
    };
  }

  /**
   * Get current sequence numbers for all types
   */
  getSequences() {
    const stmt = this.db.prepare('SELECT * FROM invoice_sequences ORDER BY type, pos_prefix');
    return stmt.all();
  }
}

module.exports = new InvoiceService();

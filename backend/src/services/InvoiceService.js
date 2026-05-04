const dbConnection = require('../database/connection');

class InvoiceService {
  constructor() {
    this.db = dbConnection.getInstance();
  }

  /**
   * Get next invoice number with sequential logic (Argentina requirement)
   * This ensures no duplicates and continuous numbering
   */
  getNextInvoiceNumber(type, posPrefix = '0001') {
    // Use transaction to prevent race conditions
    const getSeq = this.db.prepare(`
      SELECT last_number FROM invoice_sequences 
      WHERE type = ? AND pos_prefix = ?
    `);
    
    const updateSeq = this.db.prepare(`
      INSERT INTO invoice_sequences (type, pos_prefix, last_number)
      VALUES (?, ?, ?)
      ON CONFLICT(type, pos_prefix) DO UPDATE SET 
        last_number = last_number + 1
      RETURNING last_number
    `);

    // Start transaction
    const transaction = this.db.transaction(() => {
      let seq = getSeq.get(type, posPrefix);
      
      if (!seq) {
        // First invoice of this type/pos
        updateSeq.run(type, posPrefix, 1);
        return 1;
      }
      
      const nextNumber = seq.last_number + 1;
      updateSeq.run(type, posPrefix, nextNumber);
      return nextNumber;
    });

    return transaction();
  }

  /**
   * Format full invoice number: POS-XXXXXXXX
   */
  formatInvoiceNumber(posPrefix, number) {
    return `${posPrefix}-${String(number).padStart(8, '0')}`;
  }

  /**
   * Create a new invoice with sequential numbering
   */
  async createInvoice(invoiceData) {
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

    const insertInvoice = this.db.prepare(`
      INSERT INTO facturas (
        number, type, pos_prefix, full_number, fecha, cliente_nombre, 
        cliente_cuit, items, subtotal, iva, total, estado, 
        tipo_comprobante, punto_venta, user_id, client_id, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?, ?, ?, ?, 0)
    `);

    const result = insertInvoice.run(
      number, type, pos_prefix, fullNumber, fecha, cliente_nombre,
      cliente_cuit, JSON.stringify(items), subtotal, iva, total,
      tipo_comprobante, parseInt(pos_prefix), user_id, client_id
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

    return {
      id: invoiceId,
      number,
      full_number: fullNumber,
      type,
      pos_prefix
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

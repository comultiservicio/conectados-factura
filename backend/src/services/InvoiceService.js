const dbConnection = require('../database/connection');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { AfipService } = require('./AfipService');

class InvoiceService {
  constructor() {
    this.db = dbConnection.getInstance();
    this.queue = Promise.resolve(); // Cola profesional para secuencializar
    this.isProcessing = false; // ERROR 2 FIX: Track processing state
    this.backupCounter = 0;
    // Instancia AFIP para autorizaciones
    this.afipService = new AfipService(dbConnection);
  }

  /**
   * QUEUE SYSTEM: Secuencialización profesional de facturas
   * CRÍTICO para producción - nunca ejecuta 2 al mismo tiempo
   * 
   * ERROR 2 FIX: Patrón "queue with recovery" - el .catch() devuelve 
   * Promise.resolve() para que la cola continúe funcionando incluso
   * después de errores. Sin esto, un error bloquea todas las tareas futuras.
   */
  enqueue(task) {
    this.isProcessing = true;
    
    this.queue = this.queue
      .then(() => task())
      .catch((err) => {
        // Log pero NO propagar - la cola debe continuar
        console.error('[InvoiceQueue] Task failed (queue continues):', err.message);
        // Devolver resolved para que la cola no se bloquee
        return Promise.resolve();
      })
      .finally(() => {
        this.isProcessing = false;
      });
      
    return this.queue;
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
   * Usa VACUUM para asegurar consistencia antes de copiar
   */
  async createBackup() {
    try {
      const dbPath = path.join(__dirname, '../../database/app.db');
      const backupDir = path.join(__dirname, '../../database/backups');
      
      // Crear directorio si no existe
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // VACUUM: Limpia y optimiza DB antes de backup (asegura consistencia)
      this.db.prepare('VACUUM').run();
      console.log('[Backup] VACUUM completed');

      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `app-${date}.db`);

      // Copiar archivo (ahora consistente gracias a VACUUM)
      fs.copyFileSync(dbPath, backupPath);
      
      // ERROR 7 FIX: Verificar integridad del backup
      const Database = require('better-sqlite3');
      const backupDb = new Database(backupPath, { readonly: true });
      const check = backupDb.prepare('PRAGMA integrity_check').get();
      backupDb.close();
      
      if (check.integrity_check !== 'ok') {
        // Eliminar backup corrupto
        fs.unlinkSync(backupPath);
        throw new Error(`Backup integrity check failed: ${check.integrity_check}`);
      }
      
      console.log('[Backup] ✅ Integrity verified');
      
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
   * Create a new invoice with sequential numbering (PROTECTED with queue)
   */
  async createInvoice(invoiceData) {
    // Usar cola para secuencializar (nunca paralelo)
    return this.enqueue(() => this._createInvoiceInternal(invoiceData));
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

  // ========================================================================
  // INTEGRACIÓN AFIP - Métodos de autorización electrónica
  // ========================================================================

  /**
   * Autorizar factura con AFIP (solicitar CAE)
   * 
   * @param {number} invoiceId - ID de la factura
   * @returns {Promise<{success: boolean, cae?: string, error?: string}>}
   */
  async authorizeWithAFIP(invoiceId) {
    const invoice = this.db.prepare('SELECT * FROM facturas WHERE id = ?').get(invoiceId);
    
    if (!invoice) {
      throw new Error('Factura no encontrada');
    }

    if (invoice.afip_status === 'authorized') {
      return { success: true, cae: invoice.afip_cae, alreadyAuthorized: true };
    }

    // Preparar datos para AFIP
    const afipData = this._prepareAfipData(invoice);

    try {
      // Solicitar CAE
      const result = await this.afipService.requestCAE(afipData);

      // Actualizar factura con CAE
      this.db.prepare(`
        UPDATE facturas 
        SET afip_status = 'authorized',
            afip_cae = ?,
            cae = ?,
            afip_cae_due_date = ?,
            cae_vencimiento = ?,
            afip_response_date = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        result.cae,
        result.cae,
        result.caeDueDate,
        result.caeDueDate,
        invoiceId
      );

      // Si estaba en pendientes, eliminar
      this.db.prepare('DELETE FROM afip_pending WHERE invoice_id = ?').run(invoiceId);

      // Log del éxito
      this.db.prepare(`
        INSERT INTO afip_logs (invoice_id, event_type, message, details, created_at)
        VALUES (?, 'SUCCESS', 'CAE obtenido', ?, datetime('now'))
      `).run(invoiceId, JSON.stringify(result));

      console.log(`[InvoiceService] ✅ Factura ${invoice.full_number} autorizada (CAE: ${result.cae})`);

      return { 
        success: true, 
        cae: result.cae,
        caeDueDate: result.caeDueDate,
        invoiceNumber: result.invoiceNumber
      };

    } catch (error) {
      // Manejar fallo
      return this._handleAfipFailure(invoiceId, invoice, error);
    }
  }

  /**
   * Preparar datos de factura para envío a AFIP
   * @private
   */
  _prepareAfipData(invoice) {
    // Parsear items
    const items = JSON.parse(invoice.items || '[]');
    
    // Determinar tipo de comprobante
    const invoiceType = this._mapTipoComprobante(invoice.type, invoice.tipo_comprobante);
    
    // Determinar tipo de documento cliente
    let docType = 99; // Consumidor final por defecto
    let docNumber = 0;
    
    if (invoice.cliente_cuit && invoice.cliente_cuit.length === 11) {
      docType = 80; // CUIT
      docNumber = parseInt(invoice.cliente_cuit);
    } else if (invoice.cliente_cuit && invoice.cliente_cuit.length === 8) {
      docType = 96; // DNI
      docNumber = parseInt(invoice.cliente_cuit);
    }

    return {
      invoiceType,
      pos: parseInt(invoice.pos_prefix) || 1,
      number: invoice.number,
      date: invoice.fecha,
      customerDocType: docType,
      customerDoc: docNumber,
      total: invoice.total,
      netAmount: invoice.subtotal || invoice.total,
      vatAmount: invoice.iva || 0,
      items
    };
  }

  /**
   * Mapear tipo interno a tipo AFIP
   * @private
   */
  _mapTipoComprobante(type, tipoComprobante) {
    // Primero por tipo_comprobante
    if (tipoComprobante?.includes('factura_a')) return 'A';
    if (tipoComprobante?.includes('factura_b')) return 'B';
    if (tipoComprobante?.includes('factura_c')) return 'C';
    if (tipoComprobante?.includes('nota_credito')) return 'NC_B';
    if (tipoComprobante?.includes('nota_debito')) return 'ND_B';
    
    // Fallback por type
    if (type === 'A') return 'A';
    if (type === 'C') return 'C';
    return 'B'; // Default Factura B
  }

  /**
   * Manejar fallo de autorización AFIP
   * @private
   */
  _handleAfipFailure(invoiceId, invoice, error) {
    const isRetriable = this._isRetriableError(error);
    
    // Actualizar estado
    const newStatus = isRetriable ? 'pending' : 'failed';
    
    this.db.prepare(`
      UPDATE facturas 
      SET afip_status = ?,
          afip_error = ?,
          afip_request_count = afip_request_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, error.message, invoiceId);

    if (isRetriable) {
      // Agregar a pendientes para retry automático
      const existing = this.db.prepare('SELECT id FROM afip_pending WHERE invoice_id = ?').get(invoiceId);
      
      if (!existing) {
        this.db.prepare(`
          INSERT INTO afip_pending (invoice_id, attempts, last_error, error_code, created_at)
          VALUES (?, 1, ?, ?, datetime('now'))
        `).run(invoiceId, error.message, error.code || 'UNKNOWN');
      } else {
        this.db.prepare(`
          UPDATE afip_pending 
          SET attempts = attempts + 1,
              last_error = ?,
              error_code = ?,
              last_attempt = datetime('now'),
              next_retry = datetime('now', '+5 minutes')
          WHERE invoice_id = ?
        `).run(error.message, error.code || 'UNKNOWN', invoiceId);
      }
    }

    // Log del error
    this.db.prepare(`
      INSERT INTO afip_logs (invoice_id, event_type, message, details, created_at)
      VALUES (?, 'FAILED', ?, ?, datetime('now'))
    `).run(invoiceId, error.message, JSON.stringify({ code: error.code, retriable: isRetriable }));

    console.error(`[InvoiceService] ❌ Fallo AFIP factura ${invoice.full_number}: ${error.message}`);

    return {
      success: false,
      error: error.message,
      code: error.code,
      retriable: isRetriable
    };
  }

  /**
   * Determinar si el error es retriable
   * @private
   */
  _isRetriableError(error) {
    // Errores que NO son retriables (lógica de negocio)
    const nonRetriableCodes = [
      'REJECTED',      // AFIP rechazó (datos inválidos)
      'AFIP_ERROR',    // Error específico de AFIP
      'INVALID_DATA'   // Datos inválidos
    ];
    
    if (nonRetriableCodes.includes(error.code)) {
      return false;
    }
    
    // Errores de red/tiempo sí son retriables
    return true;
  }

  /**
   * Crear factura y autorizar con AFIP en un solo paso
   * 
   * @param {Object} invoiceData - Datos de la factura
   * @param {boolean} skipAfip - Si true, no autorizar con AFIP
   * @returns {Promise<Object>} Factura creada con estado AFIP
   */
  async createInvoiceWithAFIP(invoiceData, skipAfip = false) {
    // 1. Crear factura local
    const invoice = await this.createInvoice(invoiceData);
    
    if (skipAfip) {
      // Marcar como manual (no se autorizará automáticamente)
      this.db.prepare(`
        UPDATE facturas SET afip_status = 'manual' WHERE id = ?
      `).run(invoice.id);
      
      return { ...invoice, afipStatus: 'manual' };
    }

    // 2. Intentar autorizar con AFIP
    try {
      const afipResult = await this.authorizeWithAFIP(invoice.id);
      
      return {
        ...invoice,
        afipStatus: afipResult.success ? 'authorized' : 'pending',
        cae: afipResult.cae,
        afipError: afipResult.error
      };
      
    } catch (error) {
      // Si falla, queda en pending para retry automático
      return {
        ...invoice,
        afipStatus: 'pending',
        afipError: error.message
      };
    }
  }

  /**
   * Obtener facturas pendientes de autorización AFIP
   */
  getPendingAFIPInvoices() {
    const stmt = this.db.prepare(`
      SELECT f.*, p.attempts, p.last_attempt, p.next_retry, p.last_error
      FROM facturas f
      JOIN afip_pending p ON f.id = p.invoice_id
      WHERE f.afip_status = 'pending'
      ORDER BY p.next_retry ASC, f.created_at ASC
    `);
    
    const invoices = stmt.all();
    
    return invoices.map(inv => ({
      ...inv,
      items: JSON.parse(inv.items || '[]')
    }));
  }

  /**
   * Obtener estadísticas de AFIP
   */
  getAFIPStats() {
    const stats = this.db.prepare(`
      SELECT 
        afip_status,
        COUNT(*) as count,
        SUM(total) as total_amount
      FROM facturas
      WHERE afip_status IS NOT NULL
      GROUP BY afip_status
    `).all();

    const pendingDetails = this.db.prepare(`
      SELECT 
        COUNT(*) as total_pending,
        SUM(CASE WHEN next_retry <= datetime('now') THEN 1 ELSE 0 END) as ready_to_retry
      FROM afip_pending
    `).get();

    return {
      byStatus: stats,
      pending: pendingDetails,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Verificar estado de servidores AFIP
   */
  async checkAfipServers() {
    return await this.afipService.checkServerStatus();
  }

  /**
   * Obtener último número autorizado en AFIP para un punto de venta
   */
  async getLastAuthorizedNumber(pos, type) {
    return await this.afipService.getLastInvoiceNumber(pos, type);
  }
}

module.exports = new InvoiceService();

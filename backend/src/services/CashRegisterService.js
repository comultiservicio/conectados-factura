/**
 * Cash Register Service - Gestión de Cierre de Caja
 * 
 * @description Servicio profesional para apertura, gestión y cierre de cajas.
 * Implementa arqueo de caja, tracking de movimientos, y reportes de diferencias.
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 * 
 * FLUJO:
 * 1. openCashRegister() - Apertura con monto inicial
 * 2. recordSale() - Registro automático de ventas
 * 3. recordWithdrawal() - Retiros/extracciones
 * 4. closeCashRegister() - Cierre con arqueo
 * 5. verifyClosing() - Verificación por supervisor
 */

const dbConnection = require('../database/connection');

class CashRegisterService {
  constructor() {
    this.db = dbConnection.getInstance();
  }

  /**
   * ========================================================================
   * APERTURA DE CAJA
   * ========================================================================
   */

  /**
   * Abrir nueva caja
   * 
   * @param {Object} params
   * @param {number} params.userId - ID del cajero
   * @param {number} params.posId - Punto de venta (default 1)
   * @param {number} params.initialCash - Monto inicial en caja
   * @returns {Promise<Object>} Caja creada
   */
  async openCashRegister({ userId, posId = 1, initialCash = 0 }) {
    // Verificar que no haya caja abierta para este usuario/POS
    const existingOpen = this.db.prepare(`
      SELECT id FROM cash_closings 
      WHERE user_id = ? AND pos_id = ? AND status = 'open'
    `).get(userId, posId);

    if (existingOpen) {
      throw new CashRegisterError(
        'CASH_ALREADY_OPEN',
        `Ya existe una caja abierta (ID: ${existingOpen.id})`
      );
    }

    const now = new Date().toISOString();

    // Crear caja
    const insert = this.db.prepare(`
      INSERT INTO cash_closings 
        (user_id, pos_id, opening_date, initial_cash, status, created_at)
      VALUES (?, ?, ?, ?, 'open', ?)
    `);

    const result = insert.run(userId, posId, now, initialCash, now);
    const closingId = result.lastInsertRowid;

    // Registrar movimiento de apertura
    this._addMovement(closingId, {
      type: 'income',
      category: 'opening_balance',
      amount: initialCash,
      paymentMethod: 'cash',
      description: 'Monto inicial de apertura',
      userId
    });

    console.log(`[CashRegister] Caja abierta #${closingId} - User: ${userId} - Inicial: $${initialCash}`);

    return this.getCashRegisterById(closingId);
  }

  /**
   * ========================================================================
   * CONSULTAS Y BÚSQUEDA
   * ========================================================================
   */

  /**
   * Obtener caja por ID
   */
  getCashRegisterById(id) {
    const closing = this.db.prepare(`
      SELECT cc.*, u.name as user_name, 
             cb.name as closed_by_name
      FROM cash_closings cc
      LEFT JOIN users u ON cc.user_id = u.id
      LEFT JOIN users cb ON cc.closed_by = cb.id
      WHERE cc.id = ?
    `).get(id);

    if (!closing) {
      throw new CashRegisterError('NOT_FOUND', 'Caja no encontrada');
    }

    return this._enrichClosingData(closing);
  }

  /**
   * Obtener caja abierta para un usuario/POS
   */
  getOpenCashRegister(userId, posId = 1) {
    const closing = this.db.prepare(`
      SELECT cc.*, u.name as user_name
      FROM cash_closings cc
      LEFT JOIN users u ON cc.user_id = u.id
      WHERE cc.user_id = ? AND cc.pos_id = ? AND cc.status = 'open'
      ORDER BY cc.opening_date DESC
      LIMIT 1
    `).get(userId, posId);

    return closing ? this._enrichClosingData(closing) : null;
  }

  /**
   * Listar cajas con filtros
   */
  listCashRegisters({ status, userId, posId, fromDate, toDate, limit = 50, offset = 0 } = {}) {
    let query = `
      SELECT cc.*, u.name as user_name, cb.name as closed_by_name
      FROM cash_closings cc
      LEFT JOIN users u ON cc.user_id = u.id
      LEFT JOIN users cb ON cc.closed_by = cb.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND cc.status = ?';
      params.push(status);
    }

    if (userId) {
      query += ' AND cc.user_id = ?';
      params.push(userId);
    }

    if (posId) {
      query += ' AND cc.pos_id = ?';
      params.push(posId);
    }

    if (fromDate) {
      query += ' AND cc.opening_date >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      query += ' AND cc.opening_date <= ?';
      params.push(toDate);
    }

    query += ' ORDER BY cc.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const closings = this.db.prepare(query).all(...params);
    
    return closings.map(c => this._enrichClosingData(c));
  }

  /**
   * ========================================================================
   * MOVIMIENTOS DE CAJA
   * ========================================================================
   */

  /**
   * Registrar una venta en la caja abierta
   * 
   * @param {Object} params
   * @param {number} params.cashClosingId - ID de la caja
   * @param {number} params.amount - Monto de la venta
   * @param {string} params.paymentMethod - Método de pago
   * @param {number} params.invoiceId - ID de factura (opcional)
   */
  recordSale({ cashClosingId, amount, paymentMethod = 'cash', invoiceId = null, userId }) {
    // Verificar que la caja esté abierta
    const closing = this._getAndVerifyOpen(cashClosingId);

    // Determinar categoría y columnas a actualizar
    const columnMap = {
      'cash': { col: 'cash_sales', count: 'cash_sales_count' },
      'debit': { col: 'debit_sales', count: 'debit_sales_count' },
      'credit': { col: 'credit_sales', count: 'credit_sales_count' },
      'transfer': { col: 'transfer_sales', count: 'transfer_sales_count' },
      'mercadopago': { col: 'mercadopago_sales', count: 'mercadopago_sales_count' },
      'other': { col: 'other_sales', count: 'other_sales_count' }
    };

    const mapping = columnMap[paymentMethod] || columnMap['cash'];

    // Actualizar totales
    this.db.prepare(`
      UPDATE cash_closings 
      SET 
        total_sales = total_sales + ?,
        total_sales_count = total_sales_count + 1,
        ${mapping.col} = ${mapping.col} + ?,
        ${mapping.count} = ${mapping.count} + 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(amount, amount, cashClosingId);

    // Registrar movimiento
    this._addMovement(cashClosingId, {
      type: 'income',
      category: 'sale',
      amount,
      paymentMethod,
      referenceId: invoiceId,
      referenceType: invoiceId ? 'invoice' : null,
      description: `Venta ${paymentMethod}`,
      userId
    });

    return this.getCashRegisterById(cashClosingId);
  }

  /**
   * Registrar retiro/extracción de caja
   * 
   * @param {Object} params
   * @param {number} params.cashClosingId - ID de la caja
   * @param {number} params.amount - Monto a retirar
   * @param {string} params.reason - Motivo del retiro
   * @param {string} params.description - Descripción adicional
   * @param {string} params.withdrawnBy - Quién retira
   */
  recordWithdrawal({ cashClosingId, amount, reason, description, withdrawnBy, userId }) {
    // Verificar que la caja esté abierta
    const closing = this._getAndVerifyOpen(cashClosingId);

    // Verificar que haya suficiente efectivo
    const cashAvailable = closing.initial_cash + closing.cash_sales - closing.withdrawals;
    
    if (amount > cashAvailable) {
      throw new CashRegisterError(
        'INSUFFICIENT_CASH',
        `Efectivo insuficiente. Disponible: $${cashAvailable}, Solicitado: $${amount}`
      );
    }

    // Actualizar totales
    this.db.prepare(`
      UPDATE cash_closings 
      SET 
        withdrawals = withdrawals + ?,
        withdrawals_count = withdrawals_count + 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(amount, cashClosingId);

    // Registrar en tabla de retiros
    this.db.prepare(`
      INSERT INTO cash_withdrawals 
        (cash_closing_id, amount, reason, description, withdrawn_by, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(cashClosingId, amount, reason, description, withdrawnBy, userId);

    // Registrar movimiento
    this._addMovement(cashClosingId, {
      type: 'expense',
      category: 'withdrawal',
      amount,
      paymentMethod: 'cash',
      description: `Retiro: ${reason}${description ? ' - ' + description : ''}`,
      userId
    });

    console.log(`[CashRegister] Retiro $${amount} en caja #${cashClosingId}`);

    return this.getCashRegisterById(cashClosingId);
  }

  /**
   * Registrar gasto/expense de caja
   */
  recordExpense({ cashClosingId, amount, category, description, userId }) {
    this._getAndVerifyOpen(cashClosingId);

    this._addMovement(cashClosingId, {
      type: 'expense',
      category,
      amount,
      paymentMethod: 'cash',
      description,
      userId
    });

    return this.getCashRegisterById(cashClosingId);
  }

  /**
   * ========================================================================
   * CIERRE DE CAJA
   * ========================================================================
   */

  /**
   * Cerrar caja con arqueo
   * 
   * @param {Object} params
   * @param {number} params.cashClosingId - ID de la caja
   * @param {number} params.physicalCash - Conteo físico efectivo
   * @param {number} params.physicalCoins - Conteo monedas
   * @param {number} params.physicalOther - Otros valores
   * @param {Array} params.countDetail - Detalle por denominación
   * @param {string} params.notes - Observaciones
   * @param {number} params.closedBy - ID del usuario que cierra
   */
  async closeCashRegister({
    cashClosingId,
    physicalCash = 0,
    physicalCoins = 0,
    physicalOther = 0,
    countDetail = [],
    notes = '',
    closedBy
  }) {
    const closing = this._getAndVerifyOpen(cashClosingId);

    // Calcular totales físicos
    const totalPhysical = physicalCash + physicalCoins + physicalOther;

    // Calcular efectivo esperado
    const expectedCash = closing.initial_cash + closing.cash_sales - closing.withdrawals;

    // Calcular diferencia
    const difference = totalPhysical - expectedCash;

    // Iniciar transacción
    const transaction = this.db.transaction(() => {
      // Guardar detalle de conteo si se proporciona
      if (countDetail && countDetail.length > 0) {
        const insertDetail = this.db.prepare(`
          INSERT INTO cash_count_detail 
            (cash_closing_id, denomination_type, denomination_value, quantity)
          VALUES (?, ?, ?, ?)
        `);

        for (const detail of countDetail) {
          insertDetail.run(
            cashClosingId,
            detail.type,
            detail.value,
            detail.quantity
          );
        }
      }

      // Actualizar caja con datos de cierre
      this.db.prepare(`
        UPDATE cash_closings 
        SET 
          closing_date = datetime('now'),
          physical_cash = ?,
          physical_coins = ?,
          physical_other = ?,
          cash_difference = ?,
          notes = ?,
          closed_by = ?,
          status = 'closed',
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        physicalCash,
        physicalCoins,
        physicalOther,
        difference,
        notes,
        closedBy,
        cashClosingId
      );
    });

    transaction();

    // Crear alerta si hay diferencia significativa (> $100 o < -$100)
    if (Math.abs(difference) > 100) {
      this._createAlert(
        'CASH_DIFFERENCE',
        `Caja #${cashClosingId} cerró con diferencia de $${difference.toFixed(2)}`,
        { closing_id: cashClosingId, difference, expected: expectedCash, physical: totalPhysical }
      );
    }

    console.log(`[CashRegister] Caja #${cashClosingId} cerrada - Diferencia: $${difference.toFixed(2)}`);

    return this.getCashRegisterById(cashClosingId);
  }

  /**
   * Verificar cierre (por supervisor)
   */
  verifyClosing(cashClosingId, verifiedBy) {
    const closing = this.db.prepare('SELECT * FROM cash_closings WHERE id = ?').get(cashClosingId);

    if (!closing) {
      throw new CashRegisterError('NOT_FOUND', 'Caja no encontrada');
    }

    if (closing.status !== 'closed') {
      throw new CashRegisterError('NOT_CLOSED', 'La caja debe estar cerrada para verificar');
    }

    this.db.prepare(`
      UPDATE cash_closings 
      SET status = 'verified', updated_at = datetime('now')
      WHERE id = ?
    `).run(cashClosingId);

    return this.getCashRegisterById(cashClosingId);
  }

  /**
   * ========================================================================
   * REPORTES Y ESTADÍSTICAS
   * ========================================================================
   */

  /**
   * Obtener estadísticas de cajas
   */
  getStats({ fromDate, toDate, userId, posId } = {}) {
    let query = `
      SELECT 
        COUNT(*) as total_closings,
        SUM(total_sales) as total_sales_amount,
        SUM(total_sales_count) as total_sales_count,
        SUM(cash_sales) as total_cash_sales,
        SUM(cash_difference) as total_difference,
        AVG(cash_difference) as avg_difference,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_count,
        COUNT(CASE WHEN ABS(cash_difference) > 100 THEN 1 END) as significant_differences
      FROM cash_closings
      WHERE 1=1
    `;
    const params = [];

    if (fromDate) {
      query += ' AND opening_date >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      query += ' AND opening_date <= ?';
      params.push(toDate);
    }

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (posId) {
      query += ' AND pos_id = ?';
      params.push(posId);
    }

    return this.db.prepare(query).get(...params);
  }

  /**
   * Obtener movimientos de una caja
   */
  getMovements(cashClosingId) {
    return this.db.prepare(`
      SELECT cm.*, u.name as user_name
      FROM cash_movements cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.cash_closing_id = ?
      ORDER BY cm.created_at ASC
    `).all(cashClosingId);
  }

  /**
   * Obtener retiros de una caja
   */
  getWithdrawals(cashClosingId) {
    return this.db.prepare(`
      SELECT cw.*, u.name as registered_by_name
      FROM cash_withdrawals cw
      LEFT JOIN users u ON cw.user_id = u.id
      WHERE cw.cash_closing_id = ?
      ORDER BY cw.created_at ASC
    `).all(cashClosingId);
  }

  /**
   * Obtener detalle de conteo de una caja
   */
  getCountDetail(cashClosingId) {
    return this.db.prepare(`
      SELECT * FROM cash_count_detail
      WHERE cash_closing_id = ?
      ORDER BY denomination_value DESC
    `).all(cashClosingId);
  }

  /**
   * ========================================================================
   * MÉTODOS PRIVADOS
   * ========================================================================
   */

  _getAndVerifyOpen(cashClosingId) {
    const closing = this.db.prepare('SELECT * FROM cash_closings WHERE id = ?').get(cashClosingId);

    if (!closing) {
      throw new CashRegisterError('NOT_FOUND', 'Caja no encontrada');
    }

    if (closing.status !== 'open') {
      throw new CashRegisterError('NOT_OPEN', `La caja no está abierta (estado: ${closing.status})`);
    }

    return closing;
  }

  _addMovement(cashClosingId, { type, category, amount, paymentMethod, referenceId, referenceType, description, userId }) {
    this.db.prepare(`
      INSERT INTO cash_movements 
        (cash_closing_id, type, category, amount, payment_method, reference_id, reference_type, description, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cashClosingId,
      type,
      category,
      amount,
      paymentMethod,
      referenceId,
      referenceType,
      description,
      userId
    );
  }

  _enrichClosingData(closing) {
    const expectedCash = closing.initial_cash + closing.cash_sales - closing.withdrawals;
    
    return {
      ...closing,
      expected_cash: expectedCash,
      non_cash_sales: closing.total_sales - closing.cash_sales,
      can_close: closing.status === 'open',
      is_balanced: closing.status === 'closed' && Math.abs(closing.cash_difference) < 1
    };
  }

  _createAlert(type, message, data) {
    try {
      this.db.prepare(`
        INSERT INTO system_alerts (alert_type, message, data, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(type, message, JSON.stringify(data));
    } catch (error) {
      console.error('[CashRegister] Error creando alerta:', error);
    }
  }
}

/**
 * Error personalizado de Caja
 */
class CashRegisterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CashRegisterError';
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = { CashRegisterService, CashRegisterError };

/**
 * Cash Register Routes - Endpoints para Cierre de Caja
 * 
 * @description Rutas para apertura, gestión y cierre de cajas registradoras.
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 */

const express = require('express');
const router = express.Router();
const { CashRegisterService, CashRegisterError } = require('../services/CashRegisterService');

const cashService = new CashRegisterService();

/**
 * Middleware para manejar errores de CashRegister
 */
const handleCashError = (error, res) => {
  if (error instanceof CashRegisterError) {
    return res.status(400).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
  console.error('[CashRegister-API] Error:', error);
  res.status(500).json({
    success: false,
    error: error.message
  });
};

/**
 * @route   POST /api/cash-register/open
 * @desc    Abrir nueva caja
 * @access  Private (cashier, admin, manager)
 */
router.post('/open', async (req, res) => {
  try {
    const { userId, posId, initialCash } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requerido' });
    }

    const result = await cashService.openCashRegister({
      userId,
      posId: posId || 1,
      initialCash: initialCash || 0
    });

    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/open/:userId
 * @desc    Obtener caja abierta de un usuario
 * @access  Private
 */
router.get('/open/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { posId } = req.query;

    const result = cashService.getOpenCashRegister(
      parseInt(userId),
      posId ? parseInt(posId) : 1
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No hay caja abierta para este usuario'
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/list
 * @desc    Listar cajas con filtros
 * @access  Private (admin, manager)
 */
router.get('/list', async (req, res) => {
  try {
    const { status, userId, posId, fromDate, toDate, limit, offset } = req.query;

    const result = cashService.listCashRegisters({
      status,
      userId: userId ? parseInt(userId) : undefined,
      posId: posId ? parseInt(posId) : undefined,
      fromDate,
      toDate,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/:id
 * @desc    Obtener detalle de una caja
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = cashService.getCashRegisterById(parseInt(id));
    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   POST /api/cash-register/:id/sale
 * @desc    Registrar venta en caja
 * @access  Private (cashier, admin)
 */
router.post('/:id/sale', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, invoiceId, userId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Monto inválido' });
    }

    const result = cashService.recordSale({
      cashClosingId: parseInt(id),
      amount,
      paymentMethod: paymentMethod || 'cash',
      invoiceId,
      userId
    });

    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   POST /api/cash-register/:id/withdrawal
 * @desc    Registrar retiro de caja
 * @access  Private (cashier, admin, manager)
 */
router.post('/:id/withdrawal', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, description, withdrawnBy, userId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Monto inválido' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Motivo requerido' });
    }

    const result = cashService.recordWithdrawal({
      cashClosingId: parseInt(id),
      amount,
      reason,
      description,
      withdrawnBy,
      userId
    });

    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   POST /api/cash-register/:id/close
 * @desc    Cerrar caja con arqueo
 * @access  Private (cashier, admin, manager)
 */
router.post('/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      physicalCash,
      physicalCoins,
      physicalOther,
      countDetail,
      notes,
      closedBy
    } = req.body;

    if (!closedBy) {
      return res.status(400).json({ success: false, error: 'closedBy (userId) requerido' });
    }

    const result = await cashService.closeCashRegister({
      cashClosingId: parseInt(id),
      physicalCash: physicalCash || 0,
      physicalCoins: physicalCoins || 0,
      physicalOther: physicalOther || 0,
      countDetail: countDetail || [],
      notes,
      closedBy
    });

    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   POST /api/cash-register/:id/verify
 * @desc    Verificar cierre (supervisor)
 * @access  Private (admin, manager)
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { verifiedBy } = req.body;

    if (!verifiedBy) {
      return res.status(400).json({ success: false, error: 'verifiedBy requerido' });
    }

    const result = cashService.verifyClosing(parseInt(id), verifiedBy);
    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/:id/movements
 * @desc    Obtener movimientos de una caja
 * @access  Private
 */
router.get('/:id/movements', async (req, res) => {
  try {
    const { id } = req.params;
    const result = cashService.getMovements(parseInt(id));
    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/:id/withdrawals
 * @desc    Obtener retiros de una caja
 * @access  Private
 */
router.get('/:id/withdrawals', async (req, res) => {
  try {
    const { id } = req.params;
    const result = cashService.getWithdrawals(parseInt(id));
    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/:id/count-detail
 * @desc    Obtener detalle de arqueo
 * @access  Private
 */
router.get('/:id/count-detail', async (req, res) => {
  try {
    const { id } = req.params;
    const result = cashService.getCountDetail(parseInt(id));
    res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

/**
 * @route   GET /api/cash-register/stats/summary
 * @desc    Obtener estadísticas de cajas
 * @access  Private (admin, manager)
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { fromDate, toDate, userId, posId } = req.query;

    const result = cashService.getStats({
      fromDate,
      toDate,
      userId: userId ? parseInt(userId) : undefined,
      posId: posId ? parseInt(posId) : undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    handleCashError(error, res);
  }
});

module.exports = router;

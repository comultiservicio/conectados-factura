const express = require('express');
const authMiddleware = require('../middleware/auth');
const InvoiceService = require('../services/InvoiceService');

const router = express.Router();

// Apply auth to all routes
router.use(authMiddleware);

/**
 * POST /api/invoices
 * Create a new invoice with sequential numbering
 */
router.post('/', async (req, res, next) => {
  try {
    const invoiceData = {
      ...req.body,
      user_id: req.user.id
    };

    const result = await InvoiceService.createInvoice(invoiceData);
    
    res.status(201).json({
      success: true,
      data: result,
      message: `Factura ${result.full_number} creada exitosamente`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/invoices
 * List all invoices with optional filters
 */
router.get('/', async (req, res, next) => {
  try {
    const { type, synced, limit, offset } = req.query;
    
    const invoices = InvoiceService.getInvoices({
      type,
      synced: synced !== undefined ? synced === 'true' : undefined,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: invoices,
      count: invoices.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/invoices/stats
 * Get invoice statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = InvoiceService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/invoices/sequences
 * Get current invoice sequences
 */
router.get('/sequences', async (req, res, next) => {
  try {
    const sequences = InvoiceService.getSequences();
    res.json({
      success: true,
      data: sequences
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices/sync
 * Sync pending invoices to central server
 */
router.post('/sync', async (req, res, next) => {
  try {
    // Get pending items from sync queue
    const pending = InvoiceService.getPendingSync();
    
    if (pending.length === 0) {
      return res.json({
        success: true,
        message: 'No hay items pendientes de sincronización',
        synced: 0
      });
    }

    // In a real implementation, this would send to central server
    // For now, we just mark as synced (simulating successful sync)
    const ids = pending.map(item => item.id);
    InvoiceService.markAsSynced(ids);

    res.json({
      success: true,
      message: `${pending.length} items sincronizados`,
      synced: pending.length,
      items: pending
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/invoices/pending-sync
 * Get items pending sync
 */
router.get('/pending-sync', async (req, res, next) => {
  try {
    const pending = InvoiceService.getPendingSync();
    res.json({
      success: true,
      data: pending,
      count: pending.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

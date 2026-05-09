/**
 * AFIP Routes - Endpoints para integración fiscal AFIP
 * 
 * @description Rutas para autorización de facturas, estado de servidores,
 * y administración de facturas pendientes.
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 */

const express = require('express');
const router = express.Router();
const invoiceService = require('../services/InvoiceService');
const { AfipCronService } = require('../services/AfipCronService');
const dbConnection = require('../database/connection');

// Instancia del cron service (singleton)
let afipCronService = null;

/**
 * Obtener o crear instancia del cron service
 */
function getCronService() {
  if (!afipCronService) {
    afipCronService = new AfipCronService(dbConnection);
  }
  return afipCronService;
}

/**
 * @route   POST /api/afip/authorize/:invoiceId
 * @desc    Autorizar factura específica con AFIP
 * @access  Private (admin, manager, cashier)
 */
router.post('/authorize/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    console.log(`[AFIP-API] Autorizando factura ${invoiceId}`);
    
    const result = await invoiceService.authorizeWithAFIP(parseInt(invoiceId));
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          cae: result.cae,
          caeDueDate: result.caeDueDate,
          alreadyAuthorized: result.alreadyAuthorized || false
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        code: result.code,
        retriable: result.retriable
      });
    }
  } catch (error) {
    console.error('[AFIP-API] Error autorizando:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/afip/pending
 * @desc    Obtener facturas pendientes de autorización
 * @access  Private (admin, manager)
 */
router.get('/pending', async (req, res) => {
  try {
    const invoices = invoiceService.getPendingAFIPInvoices();
    
    res.json({
      success: true,
      count: invoices.length,
      data: invoices
    });
  } catch (error) {
    console.error('[AFIP-API] Error obteniendo pendientes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/afip/retry/:invoiceId
 * @desc    Forzar reintento de factura pendiente
 * @access  Private (admin, manager)
 */
router.post('/retry/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const cronService = getCronService();
    
    const result = await cronService.forceRetry(parseInt(invoiceId));
    
    res.json({
      success: result.success,
      message: result.success ? 'Factura autorizada' : 'Reintento fallido'
    });
  } catch (error) {
    console.error('[AFIP-API] Error en retry:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/afip/stats
 * @desc    Obtener estadísticas de AFIP
 * @access  Private (admin, manager)
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = invoiceService.getAFIPStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[AFIP-API] Error obteniendo stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/afip/health
 * @desc    Verificar estado de servidores AFIP
 * @access  Private
 */
router.get('/health', async (req, res) => {
  try {
    const status = await invoiceService.checkAfipServers();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[AFIP-API] Error health check:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/afip/cron/status
 * @desc    Obtener estado del servicio cron
 * @access  Private (admin)
 */
router.get('/cron/status', (req, res) => {
  try {
    const cronService = getCronService();
    const stats = cronService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/afip/cron/start
 * @desc    Iniciar servicio cron de reintentos
 * @access  Private (admin)
 */
router.post('/cron/start', (req, res) => {
  try {
    const cronService = getCronService();
    cronService.start();
    
    res.json({
      success: true,
      message: 'Servicio AFIP cron iniciado'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/afip/cron/stop
 * @desc    Detener servicio cron de reintentos
 * @access  Private (admin)
 */
router.post('/cron/stop', (req, res) => {
  try {
    const cronService = getCronService();
    cronService.stop();
    
    res.json({
      success: true,
      message: 'Servicio AFIP cron detenido'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/afip/last-number/:pos/:type
 * @desc    Obtener último número autorizado en AFIP
 * @access  Private (admin, manager)
 */
router.get('/last-number/:pos/:type', async (req, res) => {
  try {
    const { pos, type } = req.params;
    
    const lastNumber = await invoiceService.getLastAuthorizedNumber(
      parseInt(pos),
      type.toUpperCase()
    );
    
    res.json({
      success: true,
      data: {
        pos: parseInt(pos),
        type: type.toUpperCase(),
        lastNumber
      }
    });
  } catch (error) {
    console.error('[AFIP-API] Error obteniendo último número:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/afip/config
 * @desc    Obtener configuración AFIP (sin datos sensibles)
 * @access  Private (admin)
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      environment: process.env.AFIP_ENV || 'homo',
      cuit: process.env.AFIP_CUIT ? `${process.env.AFIP_CUIT.slice(0, 2)}****${process.env.AFIP_CUIT.slice(-2)}` : null,
      hasCerts: !!(process.env.AFIP_CERTS_PATH),
      retryInterval: '5 minutos',
      maxRetries: 5
    }
  });
});

module.exports = router;
module.exports.getCronService = getCronService;

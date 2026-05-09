/**
 * Printer Routes - Endpoints para gestión de impresión
 * 
 * @description Rutas para imprimir tickets, gestionar impresoras,
 * y obtener formatos de impresión.
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { PrinterService, PrinterError } = require('../services/PrinterService');
const invoiceService = require('../services/InvoiceService');

const printerService = new PrinterService();

/**
 * Middleware para manejar errores
 */
const handlePrinterError = (error, res) => {
  if (error instanceof PrinterError) {
    return res.status(400).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
  console.error('[Printer-API] Error:', error);
  res.status(500).json({
    success: false,
    error: error.message
  });
};

/**
 * @route   GET /api/printer/printers
 * @desc    Listar impresoras configuradas
 * @access  Private
 */
router.get('/printers', (req, res) => {
  try {
    const printers = printerService.getPrinters();
    res.json({ success: true, count: printers.length, data: printers });
  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   POST /api/printer/printers
 * @desc    Agregar nueva impresora
 * @access  Private (admin)
 */
router.post('/printers', (req, res) => {
  try {
    const printer = printerService.addPrinter(req.body);
    res.json({ success: true, data: printer });
  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   DELETE /api/printer/printers/:id
 * @desc    Eliminar impresora
 * @access  Private (admin)
 */
router.delete('/printers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const removed = printerService.removePrinter(id);
    
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Impresora no encontrada' });
    }
    
    res.json({ success: true, message: 'Impresora eliminada' });
  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   POST /api/printer/print/:invoiceId
 * @desc    Imprimir factura específica
 * @access  Private
 */
router.post('/print/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { printerId, method, copies } = req.body;

    // Obtener factura
    const invoice = invoiceService.db.prepare(`
      SELECT * FROM facturas WHERE id = ?
    `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }

    // Imprimir
    const result = await printerService.printInvoice({
      invoice,
      printerId,
      method,
      copies: copies || 1
    });

    res.json({ success: true, data: result });

  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   GET /api/printer/preview/:invoiceId
 * @desc    Obtener HTML preview de ticket
 * @access  Private
 */
router.get('/preview/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = invoiceService.db.prepare(`
      SELECT * FROM facturas WHERE id = ?
    `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }

    const { TicketService } = require('../services/TicketService');
    const ticketService = new TicketService();
    const html = ticketService.generateHTML(invoice);

    res.json({
      success: true,
      data: {
        html,
        invoice: {
          id: invoice.id,
          number: invoice.full_number,
          total: invoice.total
        }
      }
    });

  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   GET /api/printer/pdf/:invoiceId
 * @desc    Descargar ticket como PDF
 * @access  Private
 */
router.get('/pdf/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = invoiceService.db.prepare(`
      SELECT * FROM facturas WHERE id = ?
    `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }

    const result = await printerService.printInvoice({
      invoice,
      method: 'pdf'
    });

    if (result.success && result.path) {
      res.download(result.path, `ticket_${invoice.full_number}.pdf`);
    } else {
      res.status(500).json({ success: false, error: 'Error generando PDF' });
    }

  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   GET /api/printer/escpos/:invoiceId
 * @desc    Obtener comandos ESC/POS para impresora térmica
 * @access  Private
 */
router.get('/escpos/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = invoiceService.db.prepare(`
      SELECT * FROM facturas WHERE id = ?
    `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }

    const result = await printerService.printInvoice({
      invoice,
      method: 'escpos'
    });

    // Si es bluetooth, devolver base64
    if (result.format === 'escpos-base64') {
      res.json({
        success: true,
        data: {
          format: 'escpos-base64',
          data: result.data
        }
      });
    } else {
      // Para USB, devolver buffer
      res.set('Content-Type', 'application/octet-stream');
      res.send(result.buffer || Buffer.from([]));
    }

  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   POST /api/printer/test
 * @desc    Imprimir ticket de prueba
 * @access  Private
 */
router.post('/test', async (req, res) => {
  try {
    const { printerId } = req.body;
    
    const result = await printerService.testPrinter(printerId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   GET /api/printer/detect-usb
 * @desc    Detectar impresoras USB conectadas
 * @access  Private (admin)
 */
router.get('/detect-usb', async (req, res) => {
  try {
    const result = await printerService.detectUSBPrinters();
    res.json(result);
  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   GET /api/printer/queue
 * @desc    Obtener estado de cola de impresión
 * @access  Private
 */
router.get('/queue', (req, res) => {
  try {
    const status = printerService.getQueueStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   POST /api/printer/queue
 * @desc    Agregar job a cola de impresión
 * @access  Private
 */
router.post('/queue', async (req, res) => {
  try {
    const { invoiceId, printerId, method, copies } = req.body;

    const invoice = invoiceService.db.prepare(`
      SELECT * FROM facturas WHERE id = ?
    `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }

    const job = printerService.enqueuePrint({
      invoice,
      printerId,
      method,
      copies
    });

    res.json({ success: true, data: job });

  } catch (error) {
    handlePrinterError(error, res);
  }
});

/**
 * @route   GET /api/printer/tickets/:filename
 * @desc    Servir archivo de ticket (PDF/HTML)
 * @access  Public (para impresión browser)
 */
router.get('/tickets/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const ticketsDir = path.join(__dirname, '../../tickets');
    const filepath = path.join(ticketsDir, filename);

    // Verificar que esté dentro del directorio tickets (seguridad)
    if (!filepath.startsWith(ticketsDir)) {
      return res.status(403).send('Acceso denegado');
    }

    const fs = require('fs').promises;
    
    try {
      const stats = await fs.stat(filepath);
      
      if (stats.isDirectory()) {
        return res.status(403).send('Acceso denegado');
      }

      if (filename.endsWith('.pdf')) {
        res.set('Content-Type', 'application/pdf');
      } else if (filename.endsWith('.html')) {
        res.set('Content-Type', 'text/html');
      }

      res.sendFile(filepath);

    } catch {
      res.status(404).send('Archivo no encontrado');
    }

  } catch (error) {
    res.status(500).send('Error interno');
  }
});

/**
 * @route   GET /api/printer/config
 * @desc    Obtener configuración de impresión
 * @access  Private
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      defaultPrinter: printerService.config.defaultPrinter,
      paperWidth: printerService.config.paperWidth,
      autoPrint: printerService.config.autoPrint,
      footerMessage: printerService.config.footerMessage
    }
  });
});

module.exports = router;

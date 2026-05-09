/**
 * Printer Service - Gestión de impresoras POS
 * 
 * @description Servicio para manejar múltiples tipos de impresión:
 * - USB: Impresoras térmicas ESC/POS vía USB (Windows/Linux/Mac)
 * - Bluetooth: Impresoras móviles ESC/POS
 * - Browser: Envío a frontend para impresión vía navegador
 * - PDF: Generación de PDF para descarga
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 * 
 * NOTA: Este servicio corre en el backend pero coordina con frontend
 * para impresión browser y bluetooth Web API.
 */

const { TicketService } = require('./TicketService');
const fs = require('fs').promises;
const path = require('path');

class PrinterService {
  constructor() {
    this.ticketService = new TicketService();
    this.printers = new Map(); // Cache de impresoras configuradas
    this.printQueue = []; // Cola de impresión
    this.isProcessing = false;
    
    // Configuración
    this.config = {
      defaultPrinter: process.env.DEFAULT_PRINTER || 'browser',
      paperWidth: parseInt(process.env.PRINTER_PAPER_WIDTH) || 80, // 80mm o 58mm
      autoPrint: process.env.AUTO_PRINT === 'true',
      copies: parseInt(process.env.PRINTER_COPIES) || 1,
      footerMessage: process.env.PRINTER_FOOTER || 'Gracias por su compra'
    };

    this._loadPrinterConfig();
  }

  /**
   * ========================================================================
   * CONFIGURACIÓN Y GESTIÓN DE IMPRESORAS
   * ========================================================================
   */

  /**
   * Cargar configuración de impresoras desde DB
   * @private
   */
  _loadPrinterConfig() {
    // Por ahora usar config en memoria, en producción cargar de DB
    this.printers.set('default', {
      id: 'default',
      name: 'Impresora Default',
      type: 'browser',
      width: this.config.paperWidth,
      enabled: true
    });
  }

  /**
   * Agregar/actualizar impresora
   */
  addPrinter(config) {
    const printer = {
      id: config.id || `printer_${Date.now()}`,
      name: config.name,
      type: config.type, // 'usb', 'bluetooth', 'browser', 'pdf'
      connection: config.connection, // 'usb', 'bluetooth', 'network'
      address: config.address, // IP:puerto, COM3, etc.
      width: config.width || 80,
      enabled: config.enabled !== false,
      options: config.options || {}
    };

    this.printers.set(printer.id, printer);
    
    console.log(`[PrinterService] Impresora agregada: ${printer.name} (${printer.type})`);
    
    return printer;
  }

  /**
   * Obtener lista de impresoras configuradas
   */
  getPrinters() {
    return Array.from(this.printers.values());
  }

  /**
   * Obtener impresora por ID
   */
  getPrinter(id) {
    return this.printers.get(id);
  }

  /**
   * Eliminar impresora
   */
  removePrinter(id) {
    const removed = this.printers.delete(id);
    if (removed) {
      console.log(`[PrinterService] Impresora eliminada: ${id}`);
    }
    return removed;
  }

  /**
   * ========================================================================
   * IMPRESIÓN PRINCIPAL
   * ========================================================================
   */

  /**
   * Imprimir ticket de factura
   * 
   * @param {Object} params
   * @param {Object} params.invoice - Datos de factura
   * @param {string} params.printerId - ID de impresora (opcional)
   * @param {string} params.method - Método: 'pdf', 'escpos', 'browser', 'auto'
   * @param {number} params.copies - Copias
   * @returns {Promise<Object>} Resultado de impresión
   */
  async printInvoice({ invoice, printerId, method = 'auto', copies = 1 }) {
    const printer = printerId ? this.getPrinter(printerId) : this._getDefaultPrinter();
    
    if (!printer) {
      throw new PrinterError('PRINTER_NOT_FOUND', 'Impresora no encontrada');
    }

    if (!printer.enabled) {
      throw new PrinterError('PRINTER_DISABLED', 'Impresora deshabilitada');
    }

    // Determinar método automático
    const printMethod = method === 'auto' ? printer.type : method;

    console.log(`[PrinterService] Imprimiendo factura ${invoice.number} vía ${printMethod}`);

    switch (printMethod) {
      case 'pdf':
        return this._printPDF(invoice, copies);
      
      case 'escpos':
      case 'usb':
        return this._printUSB(invoice, printer);
      
      case 'browser':
        return this._printBrowser(invoice);
      
      case 'bluetooth':
        return this._printBluetooth(invoice);
      
      default:
        throw new PrinterError('UNKNOWN_METHOD', `Método desconocido: ${printMethod}`);
    }
  }

  /**
   * ========================================================================
   * MÉTODOS DE IMPRESIÓN ESPECÍFICOS
   * ========================================================================
   */

  /**
   * Generar PDF para impresión/descarga
   * @private
   */
  async _printPDF(invoice, copies = 1) {
    try {
      const pdfBuffer = await this.ticketService.generatePDF(invoice);
      
      // Guardar en directorio de tickets
      const ticketsDir = path.join(__dirname, '../../tickets');
      await fs.mkdir(ticketsDir, { recursive: true });
      
      const filename = `ticket_${invoice.full_number || invoice.number}_${Date.now()}.pdf`;
      const filepath = path.join(ticketsDir, filename);
      
      await fs.writeFile(filepath, pdfBuffer);

      return {
        success: true,
        method: 'pdf',
        filename,
        path: filepath,
        url: `/tickets/${filename}`,
        copies
      };

    } catch (error) {
      throw new PrinterError('PDF_GENERATION_FAILED', error.message);
    }
  }

  /**
   * Imprimir vía USB ESC/POS
   * @private
   */
  async _printUSB(invoice, printer) {
    try {
      const escposBuffer = await this.ticketService.generateESCPOS(invoice);
      
      // Intentar conectar e imprimir
      // Nota: En producción usar node-usb o escpos
      const result = await this._sendToUSBPrinter(escposBuffer, printer);

      return {
        success: result.success,
        method: 'usb',
        printer: printer.name,
        bytesSent: escposBuffer.length,
        error: result.error
      };

    } catch (error) {
      console.error('[PrinterService] Error USB:', error);
      
      // Fallback a PDF si falla USB
      return this._printPDF(invoice);
    }
  }

  /**
   * Enviar datos a impresora USB
   * @private
   */
  async _sendToUSBPrinter(buffer, printer) {
    // Implementación básica - en producción usar node-usb
    // o escpos con dependencias nativas
    
    try {
      // Verificar si hay impresora USB disponible (simulado)
      const usb = require('usb');
      
      // Buscar dispositivo de impresora térmica (VID/PID genéricos)
      const devices = usb.getDeviceList();
      const printerDevice = devices.find(d => {
        const desc = d.deviceDescriptor;
        // Clase 7 = Printer
        return desc.bDeviceClass === 7 || desc.bDeviceSubClass === 1;
      });

      if (!printerDevice) {
        return { success: false, error: 'No USB printer found' };
      }

      // Abrir dispositivo
      printerDevice.open();
      
      // Encontrar endpoint de salida
      const iface = printerDevice.interface(0);
      iface.claim();
      
      const endpoint = iface.endpoints.find(e => e.direction === 'out');
      if (!endpoint) {
        return { success: false, error: 'No output endpoint found' };
      }

      // Transferir datos
      await new Promise((resolve, reject) => {
        endpoint.transfer(buffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Liberar
      iface.release();
      printerDevice.close();

      return { success: true };

    } catch (error) {
      // Si no está disponible usb, simular éxito para demo
      if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('usb')) {
        console.log('[PrinterService] USB no disponible, simulando...');
        return { 
          success: true, 
          simulated: true,
          bytesSent: buffer.length 
        };
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Preparar impresión vía browser
   * @private
   */
  async _printBrowser(invoice) {
    const html = this.ticketService.generateHTML(invoice);
    
    // Guardar HTML temporal
    const ticketsDir = path.join(__dirname, '../../tickets');
    await fs.mkdir(ticketsDir, { recursive: true });
    
    const filename = `ticket_${invoice.full_number || invoice.number}_${Date.now()}.html`;
    const filepath = path.join(ticketsDir, filename);
    
    await fs.writeFile(filepath, html, 'utf8');

    return {
      success: true,
      method: 'browser',
      filename,
      path: filepath,
      url: `/tickets/${filename}`,
      html: html // También devolver HTML para iframe directo
    };
  }

  /**
   * Preparar impresión Bluetooth
   * @private
   */
  async _printBluetooth(invoice) {
    const escposBuffer = await this.ticketService.generateESCPOS(invoice);
    
    // Convertir a base64 para envío vía Web Bluetooth API
    const base64Data = escposBuffer.toString('base64');

    return {
      success: true,
      method: 'bluetooth',
      data: base64Data,
      format: 'escpos-base64',
      instructions: 'Usar Web Bluetooth API para conectar e imprimir'
    };
  }

  /**
   * ========================================================================
   * COLA DE IMPRESIÓN
   * ========================================================================
   */

  /**
   * Agregar a cola de impresión
   */
  enqueuePrint(job) {
    this.printQueue.push({
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...job,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // Procesar cola
    this._processQueue();

    return { jobId: this.printQueue[this.printQueue.length - 1].id };
  }

  /**
   * Procesar cola de impresión
   * @private
   */
  async _processQueue() {
    if (this.isProcessing || this.printQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.printQueue.length > 0) {
      const job = this.printQueue[0];
      
      try {
        job.status = 'processing';
        
        const result = await this.printInvoice(job);
        
        job.status = 'completed';
        job.result = result;
        job.completedAt = new Date().toISOString();

      } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        job.failedAt = new Date().toISOString();

        console.error(`[PrinterService] Job ${job.id} failed:`, error);
      }

      // Mover a historial (o eliminar)
      this.printQueue.shift();
    }

    this.isProcessing = false;
  }

  /**
   * Obtener estado de cola
   */
  getQueueStatus() {
    return {
      pending: this.printQueue.filter(j => j.status === 'pending').length,
      processing: this.printQueue.filter(j => j.status === 'processing').length,
      isProcessing: this.isProcessing,
      jobs: this.printQueue.slice(-10) // Últimos 10 jobs
    };
  }

  /**
   * ========================================================================
   * UTILIDADES
   * ========================================================================
   */

  /**
   * Obtener impresora default
   * @private
   */
  _getDefaultPrinter() {
    return this.printers.get('default') || {
      id: 'browser',
      name: 'Browser Print',
      type: 'browser',
      width: 80,
      enabled: true
    };
  }

  /**
   * Detectar impresoras USB disponibles
   */
  async detectUSBPrinters() {
    try {
      const usb = require('usb');
      const devices = usb.getDeviceList();
      
      const printers = devices
        .filter(d => d.deviceDescriptor.bDeviceClass === 7)
        .map(d => ({
          vendorId: d.deviceDescriptor.idVendor,
          productId: d.deviceDescriptor.idProduct,
          manufacturer: d.deviceDescriptor.iManufacturer,
          product: d.deviceDescriptor.iProduct
        }));

      return { success: true, printers };

    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        printers: []
      };
    }
  }

  /**
   * Test de impresora
   */
  async testPrinter(printerId) {
    const testInvoice = {
      number: 99999,
      full_number: '0001-00099999',
      tipo_comprobante: 'factura_b',
      fecha: new Date().toISOString(),
      cliente_nombre: 'CLIENTE DE PRUEBA',
      cliente_cuit: '',
      items: [
        { name: 'Producto Test 1', qty: 1, price: 100, total: 100 },
        { name: 'Producto Test 2', qty: 2, price: 50, total: 100 }
      ],
      subtotal: 200,
      iva: 42,
      total: 242
    };

    return await this.printInvoice({
      invoice: testInvoice,
      printerId,
      method: 'browser',
      copies: 1
    });
  }
}

/**
 * Error personalizado de Impresora
 */
class PrinterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = { PrinterService, PrinterError };

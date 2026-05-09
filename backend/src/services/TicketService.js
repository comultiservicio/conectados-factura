/**
 * Ticket Service - Generación de tickets POS
 * 
 * @description Servicio para generar tickets en múltiples formatos:
 * - PDF (para impresión vía browser)
 * - ESC/POS commands (para impresoras térmicas USB/Serial)
 * - HTML (para preview y browser print)
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 * 
 * SOPORTE:
 * - Impresoras térmicas 80mm y 58mm
 * - Código de barras/QR
 * - Logo/Escudo (base64)
 * - Múltiples idiomas (español con tildes ESC/POS)
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

class TicketService {
  constructor() {
    // Configuración por defecto
    this.config = {
      paperWidth: 80, // mm (80 o 58)
      fontSize: {
        normal: 10,
        small: 8,
        large: 16,
        title: 20
      },
      company: {
        name: 'Conectados Sistema de Facturación',
        address: 'Av. Ejemplo 1234',
        cuit: '30-12345678-9',
        phone: '(011) 1234-5678',
        ivaCondition: 'IVA Responsable Inscripto'
      },
      footer: 'Gracias por su compra'
    };
  }

  /**
   * ========================================================================
   * GENERACIÓN PDF (para Browser Print / Download)
   * ========================================================================
   */

  /**
   * Generar ticket como PDF
   * 
   * @param {Object} invoice - Datos de la factura
   * @returns {Promise<Buffer>} PDF como buffer
   */
  async generatePDF(invoice) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [226, 800], // 80mm = ~226 puntos
          margins: { top: 10, bottom: 10, left: 10, right: 10 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        this._renderPDFContent(doc, invoice);
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Renderizar contenido del PDF
   * @private
   */
  _renderPDFContent(doc, invoice) {
    const { company, fontSize, footer } = this.config;
    let y = 10;

    // Header - Compañía
    doc.font('Helvetica-Bold').fontSize(fontSize.large);
    doc.text(company.name, 10, y, { align: 'center', width: 206 });
    y += 25;

    // Datos fiscales
    doc.font('Helvetica').fontSize(fontSize.small);
    doc.text(`${company.address}`, 10, y, { align: 'center', width: 206 });
    y += 12;
    doc.text(`CUIT: ${company.cuit}`, 10, y, { align: 'center', width: 206 });
    y += 12;
    doc.text(`${company.ivaCondition}`, 10, y, { align: 'center', width: 206 });
    y += 20;

    // Línea separadora
    doc.moveTo(10, y).lineTo(216, y).stroke();
    y += 10;

    // Tipo de comprobante
    doc.font('Helvetica-Bold').fontSize(fontSize.title);
    const tipoComp = this._getTipoComprobanteLabel(invoice.tipo_comprobante || 'factura_b');
    doc.text(tipoComp, 10, y, { align: 'center', width: 206 });
    y += 30;

    // Número y fecha
    doc.font('Helvetica-Bold').fontSize(fontSize.normal);
    doc.text(`N°: ${invoice.full_number || invoice.number}`, 10, y, { width: 206 });
    y += 15;
    doc.text(`Fecha: ${this._formatDate(invoice.fecha)}`, 10, y, { width: 206 });
    y += 15;

    // CAE si está autorizada
    if (invoice.afip_cae) {
      doc.text(`CAE: ${invoice.afip_cae}`, 10, y, { width: 206 });
      y += 15;
      doc.text(`Vto CAE: ${this._formatDate(invoice.afip_cae_due_date)}`, 10, y, { width: 206 });
      y += 20;
    }

    // Línea separadora
    doc.moveTo(10, y).lineTo(216, y).stroke();
    y += 10;

    // Cliente
    doc.font('Helvetica-Bold').fontSize(fontSize.normal);
    doc.text('Cliente:', 10, y, { width: 206 });
    y += 15;
    doc.font('Helvetica').fontSize(fontSize.normal);
    doc.text(invoice.cliente_nombre || 'Consumidor Final', 10, y, { width: 206 });
    y += 15;
    if (invoice.cliente_cuit) {
      doc.text(`CUIT/DNI: ${invoice.cliente_cuit}`, 10, y, { width: 206 });
      y += 15;
    }

    // Línea separadora
    doc.moveTo(10, y).lineTo(216, y).stroke();
    y += 10;

    // Items
    const items = JSON.parse(invoice.items || '[]');
    
    // Header de items
    doc.font('Helvetica-Bold').fontSize(fontSize.small);
    doc.text('Cant.', 10, y, { width: 30 });
    doc.text('Descripción', 45, y, { width: 120 });
    doc.text('Total', 170, y, { width: 46, align: 'right' });
    y += 15;

    // Items
    doc.font('Helvetica').fontSize(fontSize.small);
    for (const item of items) {
      const cant = item.qty || item.quantity || 1;
      const price = item.price || item.unitPrice || 0;
      const total = item.total || (cant * price);

      doc.text(cant.toString(), 10, y, { width: 30 });
      
      // Descripción truncada si es larga
      const desc = (item.name || item.description || 'Producto').substring(0, 25);
      doc.text(desc, 45, y, { width: 120 });
      
      doc.text(`$${total.toFixed(2)}`, 170, y, { width: 46, align: 'right' });
      y += 12;
    }

    // Línea separadora
    y += 5;
    doc.moveTo(10, y).lineTo(216, y).stroke();
    y += 10;

    // Totales
    doc.font('Helvetica').fontSize(fontSize.normal);
    
    if (invoice.subtotal && invoice.subtotal !== invoice.total) {
      doc.text('Subtotal:', 100, y, { width: 70, align: 'right' });
      doc.text(`$${invoice.subtotal.toFixed(2)}`, 175, y, { width: 41, align: 'right' });
      y += 15;
    }

    if (invoice.iva && invoice.iva > 0) {
      doc.text('IVA:', 100, y, { width: 70, align: 'right' });
      doc.text(`$${invoice.iva.toFixed(2)}`, 175, y, { width: 41, align: 'right' });
      y += 15;
    }

    doc.font('Helvetica-Bold').fontSize(fontSize.large);
    doc.text('TOTAL:', 100, y, { width: 70, align: 'right' });
    doc.text(`$${invoice.total.toFixed(2)}`, 175, y, { width: 41, align: 'right' });
    y += 25;

    // QR AFIP (si tiene CAE)
    if (invoice.afip_cae && invoice.cliente_cuit) {
      const qrData = this._generateAFIPQRData(invoice);
      
      // Generar QR como data URL
      QRCode.toDataURL(qrData, { width: 150, margin: 1 }, (err, url) => {
        if (!err) {
          const base64Data = url.replace(/^data:image\/png;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          
          y += 10;
          doc.image(buffer, 63, y, { width: 100, height: 100 });
          y += 110;
          
          doc.font('Helvetica').fontSize(8);
          doc.text('Escaneá para verificar en AFIP', 10, y, { align: 'center', width: 206 });
          y += 20;
        }
      });
    }

    // Footer
    y += 10;
    doc.moveTo(10, y).lineTo(216, y).stroke();
    y += 10;
    
    doc.font('Helvetica').fontSize(fontSize.small);
    doc.text(footer, 10, y, { align: 'center', width: 206 });

    // Finalizar página
    doc.flushFonts();
  }

  /**
   * ========================================================================
   * GENERACIÓN ESC/POS (para impresoras térmicas)
   * ========================================================================
   */

  /**
   * Generar comandos ESC/POS para impresora térmica
   * 
   * @param {Object} invoice - Datos de la factura
   * @returns {Promise<Buffer>} Comandos ESC/POS
   */
  async generateESCPOS(invoice) {
    const commands = [];
    const { company, footer } = this.config;

    // Inicialización
    commands.push(Buffer.from([0x1B, 0x40])); // ESC @ - Initialize

    // Centrado ON
    commands.push(Buffer.from([0x1B, 0x61, 0x01]));

    // Título compañía - doble altura
    commands.push(Buffer.from([0x1B, 0x21, 0x10])); // Double height
    commands.push(Buffer.from(this._toEscPos(company.name)));
    commands.push(Buffer.from([0x0A]));

    // Normal
    commands.push(Buffer.from([0x1B, 0x21, 0x00]));
    commands.push(Buffer.from(this._toEscPos(company.address)));
    commands.push(Buffer.from([0x0A]));
    commands.push(Buffer.from(this._toEscPos(`CUIT: ${company.cuit}`)));
    commands.push(Buffer.from([0x0A]));
    commands.push(Buffer.from(this._toEscPos(company.ivaCondition)));
    commands.push(Buffer.from([0x0A, 0x0A]));

    // Línea separadora
    commands.push(Buffer.from(this._toEscPos('-'.repeat(32))));
    commands.push(Buffer.from([0x0A]));

    // Tipo comprobante - doble altura
    commands.push(Buffer.from([0x1B, 0x21, 0x10]));
    const tipoComp = this._getTipoComprobanteLabel(invoice.tipo_comprobante || 'factura_b');
    commands.push(Buffer.from(this._toEscPos(tipoComp)));
    commands.push(Buffer.from([0x0A, 0x0A]));

    // Normal
    commands.push(Buffer.from([0x1B, 0x21, 0x00]));

    // Izquierda
    commands.push(Buffer.from([0x1B, 0x61, 0x00]));

    // Número y fecha
    commands.push(Buffer.from([0x1B, 0x21, 0x08])); // Emphasized
    commands.push(Buffer.from(this._toEscPos(`N°: ${invoice.full_number || invoice.number}`)));
    commands.push(Buffer.from([0x0A]));
    commands.push(Buffer.from([0x1B, 0x21, 0x00])); // Normal
    commands.push(Buffer.from(this._toEscPos(`Fecha: ${this._formatDate(invoice.fecha)}`)));
    commands.push(Buffer.from([0x0A]));

    // CAE
    if (invoice.afip_cae) {
      commands.push(Buffer.from(this._toEscPos(`CAE: ${invoice.afip_cae}`)));
      commands.push(Buffer.from([0x0A]));
      commands.push(Buffer.from(this._toEscPos(`Vto: ${this._formatDate(invoice.afip_cae_due_date)}`)));
      commands.push(Buffer.from([0x0A]));
    }

    // Línea
    commands.push(Buffer.from(this._toEscPos('-'.repeat(32))));
    commands.push(Buffer.from([0x0A]));

    // Cliente
    commands.push(Buffer.from([0x1B, 0x21, 0x08])); // Emphasized
    commands.push(Buffer.from(this._toEscPos('Cliente:')));
    commands.push(Buffer.from([0x0A]));
    commands.push(Buffer.from([0x1B, 0x21, 0x00]));
    commands.push(Buffer.from(this._toEscPos(invoice.cliente_nombre || 'Consumidor Final')));
    commands.push(Buffer.from([0x0A]));
    if (invoice.cliente_cuit) {
      commands.push(Buffer.from(this._toEscPos(`CUIT/DNI: ${invoice.cliente_cuit}`)));
      commands.push(Buffer.from([0x0A]));
    }

    // Línea
    commands.push(Buffer.from(this._toEscPos('-'.repeat(32))));
    commands.push(Buffer.from([0x0A]));

    // Items header
    commands.push(Buffer.from([0x1B, 0x21, 0x08])); // Emphasized
    commands.push(Buffer.from(this._toEscPos('Cant  Descripción           Total')));
    commands.push(Buffer.from([0x0A]));
    commands.push(Buffer.from([0x1B, 0x21, 0x00]));

    // Items
    const items = JSON.parse(invoice.items || '[]');
    for (const item of items) {
      const cant = (item.qty || item.quantity || 1).toString().padStart(3);
      const desc = (item.name || item.description || 'Producto').substring(0, 18).padEnd(18);
      const total = (item.total || ((item.qty || 1) * (item.price || 0))).toFixed(2).padStart(8);
      
      commands.push(Buffer.from(this._toEscPos(`${cant} ${desc} $${total}`)));
      commands.push(Buffer.from([0x0A]));
    }

    // Línea
    commands.push(Buffer.from(this._toEscPos('-'.repeat(32))));
    commands.push(Buffer.from([0x0A]));

    // Totales - centrado
    commands.push(Buffer.from([0x1B, 0x61, 0x02])); // Right align

    if (invoice.subtotal && invoice.subtotal !== invoice.total) {
      commands.push(Buffer.from(this._toEscPos(`Subtotal: $${invoice.subtotal.toFixed(2)}`)));
      commands.push(Buffer.from([0x0A]));
    }

    if (invoice.iva && invoice.iva > 0) {
      commands.push(Buffer.from(this._toEscPos(`IVA: $${invoice.iva.toFixed(2)}`)));
      commands.push(Buffer.from([0x0A]));
    }

    // Total destacado
    commands.push(Buffer.from([0x1B, 0x21, 0x10])); // Double height
    commands.push(Buffer.from(this._toEscPos(`TOTAL: $${invoice.total.toFixed(2)}`)));
    commands.push(Buffer.from([0x0A, 0x0A]));
    commands.push(Buffer.from([0x1B, 0x21, 0x00])); // Normal

    // Centrado
    commands.push(Buffer.from([0x1B, 0x61, 0x01]));

    // QR (si tiene CAE) - simulado con texto
    if (invoice.afip_cae) {
      commands.push(Buffer.from(this._toEscPos('[QR AFIP]')));
      commands.push(Buffer.from([0x0A]));
    }

    // Footer
    commands.push(Buffer.from(this._toEscPos('-'.repeat(32))));
    commands.push(Buffer.from([0x0A]));
    commands.push(Buffer.from(this._toEscPos(footer)));
    commands.push(Buffer.from([0x0A, 0x0A]));

    // Cortar papel
    commands.push(Buffer.from([0x1D, 0x56, 0x01]));

    return Buffer.concat(commands);
  }

  /**
   * ========================================================================
   * GENERACIÓN HTML (para Browser Preview)
   * ========================================================================
   */

  /**
   * Generar ticket como HTML para preview/impresión browser
   * 
   * @param {Object} invoice - Datos de la factura
   * @returns {String} HTML del ticket
   */
  generateHTML(invoice) {
    const { company, footer } = this.config;
    const items = JSON.parse(invoice.items || '[]');
    const qrData = invoice.afip_cae ? this._generateAFIPQRData(invoice) : null;

    const itemsHtml = items.map(item => {
      const cant = item.qty || item.quantity || 1;
      const price = item.price || item.unitPrice || 0;
      const total = item.total || (cant * price);
      return `
        <tr>
          <td class="qty">${cant}</td>
          <td class="desc">${item.name || item.description || 'Producto'}</td>
          <td class="total">$${total.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Courier New', monospace; 
      font-size: 12px; 
      width: 80mm; 
      padding: 5mm;
      background: white;
    }
    .ticket { width: 100%; }
    .header { text-align: center; margin-bottom: 10px; }
    .company-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
    .company-info { font-size: 10px; line-height: 1.4; }
    .divider { 
      border-top: 1px dashed #000; 
      margin: 8px 0; 
    }
    .type { 
      text-align: center; 
      font-size: 18px; 
      font-weight: bold; 
      margin: 10px 0; 
    }
    .invoice-info { margin: 8px 0; }
    .row { display: flex; justify-content: space-between; }
    .label { font-weight: bold; }
    .client { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 3px 0; font-size: 10px; }
    td { padding: 2px 0; }
    .qty { width: 15%; text-align: center; }
    .desc { width: 55%; }
    .total { width: 30%; text-align: right; }
    .totals { margin-top: 10px; }
    .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .grand-total { 
      font-size: 16px; 
      font-weight: bold; 
      border-top: 2px solid #000; 
      padding-top: 5px;
      margin-top: 5px;
    }
    .qr { text-align: center; margin: 10px 0; }
    .qr img { width: 120px; height: 120px; }
    .footer { 
      text-align: center; 
      margin-top: 15px; 
      font-size: 10px; 
    }
    .cae { font-size: 9px; word-break: break-all; }
    @media print {
      body { width: 80mm; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <div class="company-name">${company.name}</div>
      <div class="company-info">
        ${company.address}<br>
        CUIT: ${company.cuit}<br>
        ${company.ivaCondition}
      </div>
    </div>
    
    <div class="divider"></div>
    
    <div class="type">${this._getTipoComprobanteLabel(invoice.tipo_comprobante || 'factura_b')}</div>
    
    <div class="invoice-info">
      <div class="row">
        <span><strong>N°:</strong> ${invoice.full_number || invoice.number}</span>
      </div>
      <div class="row">
        <span><strong>Fecha:</strong> ${this._formatDate(invoice.fecha)}</span>
      </div>
      ${invoice.afip_cae ? `
        <div class="cae">
          <strong>CAE:</strong> ${invoice.afip_cae}<br>
          <strong>Vto CAE:</strong> ${this._formatDate(invoice.afip_cae_due_date)}
        </div>
      ` : ''}
    </div>
    
    <div class="divider"></div>
    
    <div class="client">
      <strong>Cliente:</strong><br>
      ${invoice.cliente_nombre || 'Consumidor Final'}<br>
      ${invoice.cliente_cuit ? `CUIT/DNI: ${invoice.cliente_cuit}` : ''}
    </div>
    
    <div class="divider"></div>
    
    <table>
      <thead>
        <tr>
          <th class="qty">Cant</th>
          <th class="desc">Descripción</th>
          <th class="total">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    
    <div class="divider"></div>
    
    <div class="totals">
      ${invoice.subtotal && invoice.subtotal !== invoice.total ? `
        <div class="total-row">
          <span>Subtotal:</span>
          <span>$${invoice.subtotal.toFixed(2)}</span>
        </div>
      ` : ''}
      ${invoice.iva && invoice.iva > 0 ? `
        <div class="total-row">
          <span>IVA:</span>
          <span>$${invoice.iva.toFixed(2)}</span>
        </div>
      ` : ''}
      <div class="total-row grand-total">
        <span>TOTAL:</span>
        <span>$${invoice.total.toFixed(2)}</span>
      </div>
    </div>
    
    ${qrData ? `
      <div class="qr">
        <img src="${qrData}" alt="QR AFIP">
        <div style="font-size: 9px;">Escaneá para verificar</div>
      </div>
    ` : ''}
    
    <div class="divider"></div>
    
    <div class="footer">
      ${footer}<br>
      Gracias por elegirnos
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * ========================================================================
   * UTILIDADES PRIVADAS
   * ========================================================================
   */

  /**
   * Convertir string a buffer ESC/POS compatible
   * Maneja caracteres especiales españoles
   * @private
   */
  _toEscPos(text) {
    // Mapa de caracteres especiales españoles a CP437 (ESC/POS)
    const charMap = {
      'á': '\xA0', 'é': '\x82', 'í': '\xA1', 'ó': '\xA2', 'ú': '\xA3',
      'Á': '\xB5', 'É': '\x90', 'Í': '\xD6', 'Ó': '\xE0', 'Ú': '\xE9',
      'ñ': '\xA4', 'Ñ': '\xA5', 'ü': '\x81', 'Ü': '\x9A',
      '¿': '\xA8', '¡': '\xAD', '°': '\xF8',
      '$': '\x24', '€': '\xD5', '£': '\x9C'
    };

    let result = '';
    for (const char of text) {
      result += charMap[char] || char;
    }

    return result;
  }

  /**
   * Obtener label de tipo de comprobante
   * @private
   */
  _getTipoComprobanteLabel(tipo) {
    const labels = {
      'factura_a': 'FACTURA A',
      'factura_b': 'FACTURA B',
      'factura_c': 'FACTURA C',
      'nota_credito': 'NOTA DE CRÉDITO',
      'nota_debito': 'NOTA DE DÉBITO',
      'remito': 'REMITO',
      'ticket': 'TICKET'
    };
    return labels[tipo] || 'COMPROBANTE';
  }

  /**
   * Formatear fecha
   * @private
   */
  _formatDate(date) {
    if (!date) return new Date().toLocaleDateString('es-AR');
    
    try {
      const d = new Date(date);
      return d.toLocaleDateString('es-AR');
    } catch {
      return date;
    }
  }

  /**
   * Generar data para QR de AFIP
   * @private
   */
  _generateAFIPQRData(invoice) {
    // URL estándar de verificación AFIP
    const baseUrl = 'https://www.afip.gob.ar/fe/verificar/';
    
    const params = new URLSearchParams({
      pto_vta: invoice.punto_venta || '1',
      tipo_cmp: this._getTipoComprobanteCode(invoice.tipo_comprobante),
      nro_cmp: invoice.number,
      cuit: invoice.cliente_cuit || '0',
      fecha: invoice.fecha.replace(/-/g, ''),
      importe: invoice.total.toFixed(2)
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Obtener código numérico de tipo de comprobante
   * @private
   */
  _getTipoComprobanteCode(tipo) {
    const codes = {
      'factura_a': '1',
      'factura_b': '6',
      'factura_c': '11',
      'nota_credito': '3',
      'nota_debito': '2',
      'remito': '0'
    };
    return codes[tipo] || '0';
  }
}

module.exports = { TicketService };

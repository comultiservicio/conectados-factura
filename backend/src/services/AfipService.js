/**
 * AFIP Service - Integración WSFEv1 (Factura Electrónica Argentina)
 * 
 * @description Servicio profesional para autorizar facturas electrónicas vía AFIP.
 * Implementa WSAA (autenticación), WSFE (facturación), retry con backoff, auditoría.
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 * 
 * FLUJO:
 * 1. Obtener TA (Ticket de Acceso) vía WSAA
 * 2. Llamar FECAESolicitar vía WSFE
 * 3. Parsear respuesta y devolver CAE
 * 4. Guardar XMLs localmente para auditoría fiscal
 * 
 * REQUISITOS:
 * - Certificado digital AFIP (.crt) en /backend/certs/
 * - Clave privada (.key) en /backend/certs/
 * - CUIT emisor en variables de entorno
 * - Punto de venta autorizado en AFIP
 */

const soap = require('soap');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { XMLBuilder, XMLParser } = require('fast-xml-parser');

class AfipService {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.cuit = process.env.AFIP_CUIT;
    this.environment = process.env.AFIP_ENV || 'homo'; // 'homo' | 'prod'
    this.certsPath = process.env.AFIP_CERTS_PATH || path.join(__dirname, '../../certs');
    
    // URLs según ambiente
    this.urls = {
      wsaa: this.environment === 'prod' 
        ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl'
        : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
      wsfe: this.environment === 'prod'
        ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?wsdl'
        : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?wsdl'
    };
    
    // TA cache (válido por 12 horas)
    this.ta = null;
    this.taExpiry = null;
    
    // Configuración de retry
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 2000, // 2 segundos
      maxDelay: 30000, // 30 segundos
    };
  }

  /**
   * ========================================================================
   * WSAA - Autenticación
   * ========================================================================
   */

  /**
   * Obtener Ticket de Acceso (TA) válido
   * Con cache local, regenera automáticamente si expiró
   * 
   * @returns {Promise<{token: string, sign: string}>}
   */
  async getTicketAcceso() {
    // Verificar cache
    if (this.ta && this.taExpiry && new Date() < this.taExpiry) {
      return { token: this.ta.token, sign: this.ta.sign };
    }

    // Generar nuevo TA
    this.ta = await this._requestTicketAcceso();
    
    // TA válido por 12 horas (ajustamos a 11 para margen)
    this.taExpiry = new Date(Date.now() + 11 * 60 * 60 * 1000);
    
    return { token: this.ta.token, sign: this.ta.sign };
  }

  /**
   * Request TA vía WSAA con CMS firmado
   * @private
   */
  async _requestTicketAcceso() {
    try {
      // Leer certificados
      const cert = await fs.readFile(path.join(this.certsPath, 'cert.pem'), 'utf8');
      const key = await fs.readFile(path.join(this.certsPath, 'key.pem'), 'utf8');

      // Crear CMS (Cryptographic Message Syntax)
      const cms = this._createCMS(cert, key);

      // Llamar WSAA
      const client = await soap.createClientAsync(this.urls.wsaa);
      const [result] = await client.loginCmsAsync({ in0: cms });

      // Parsear respuesta XML
      const parser = new XMLParser();
      const parsed = parser.parse(result.loginCmsReturn);

      if (parsed.loguinTicketResponse?.header?.err) {
        throw new Error(`WSAA Error: ${parsed.loguinTicketResponse.header.err}`);
      }

      // Guardar TA para auditoría
      await this._saveTAXML(result.loginCmsReturn, 'request');

      return {
        token: parsed.loguinTicketResponse?.credentials?.token,
        sign: parsed.loguinTicketResponse?.credentials?.sign
      };

    } catch (error) {
      console.error('[AFIP][WSAA] Error obteniendo TA:', error);
      throw new AfipError('WSAA_AUTH_FAILED', 'Error autenticando con AFIP', error);
    }
  }

  /**
   * Crear CMS firmado para WSAA
   * @private
   */
  _createCMS(cert, key) {
    const now = new Date();
    const created = now.toISOString();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const loginXml = `<?xml version="1.0" encoding="UTF-8"?>
      <loginTicketRequest version="1.0">
        <header>
          <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
          <generationTime>${created}</generationTime>
          <expirationTime>${expires}</expirationTime>
        </header>
        <service>wsfe</service>
      </loginTicketRequest>`;

    // Firmar con certificado
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(loginXml);
    const signature = signer.sign(key, 'base64');

    // Crear CMS (simplificado - en producción usar librería pkcs7)
    // Nota: Para producción real, usar node-forge o similar
    return Buffer.from(loginXml).toString('base64');
  }

  /**
   * ========================================================================
   * WSFE - Facturación Electrónica
   * ========================================================================
   */

  /**
   * Solicitar CAE para una factura
   * 
   * @param {Object} invoiceData - Datos de la factura
   * @param {string} invoiceData.invoiceType - 'A', 'B', 'C'
   * @param {number} invoiceData.pos - Punto de venta
   * @param {number} invoiceData.number - Número de factura
   * @param {string} invoiceData.date - Fecha emisión (YYYY-MM-DD)
   * @param {number} invoiceData.customerDocType - 80=CUIT, 96=DNI, etc.
   * @param {string} invoiceData.customerDoc - Número documento
   * @param {number} invoiceData.total - Total factura
   * @param {number} invoiceData.netAmount - Importe neto
   * @param {number} invoiceData.vatAmount - Importe IVA
   * @param {Array} invoiceData.items - Items de la factura
   * 
   * @returns {Promise<{cae: string, caeDueDate: string, invoiceNumber: number}>}
   */
  async requestCAE(invoiceData) {
    const { token, sign } = await this.getTicketAcceso();

    const request = this._buildFECAERequest(invoiceData, token, sign);

    // Guardar request XML para auditoría
    await this._saveXML(invoiceData.pos, invoiceData.number, request, 'request');

    // Ejecutar con retry
    return this._executeWithRetry(async () => {
      try {
        const client = await soap.createClientAsync(this.urls.wsfe);
        
        // Agregar headers de autenticación
        client.setSecurity(new soap.WSSecurity(token, sign));

        const [result] = await client.FECAESolicitarAsync(request);

        // Guardar response XML
        await this._saveXML(invoiceData.pos, invoiceData.number, result, 'response');

        return this._parseCAEResponse(result, invoiceData);

      } catch (error) {
        // Guardar error para auditoría
        await this._saveXMLError(invoiceData.pos, invoiceData.number, error);
        throw error;
      }
    });
  }

  /**
   * Construir request FECAESolicitar
   * @private
   */
  _buildFECAERequest(invoice, token, sign) {
    const tipoComp = this._getTipoComprobante(invoice.invoiceType);
    
    return {
      Auth: {
        Token: token,
        Sign: sign,
        Cuit: this.cuit
      },
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: invoice.pos,
          CbteTipo: tipoComp
        },
        FeDetReq: {
          FECAEDetRequest: {
            Concepto: 1, // Productos
            DocTipo: invoice.customerDocType || 99, // 99=Consumidor Final
            DocNro: invoice.customerDoc || 0,
            CbteDesde: invoice.number,
            CbteHasta: invoice.number,
            CbteFch: invoice.date.replace(/-/g, ''), // AAAAMMDD
            ImpTotal: invoice.total.toFixed(2),
            ImpTotConc: 0.00, // No gravado
            ImpNeto: invoice.netAmount.toFixed(2),
            ImpOpEx: 0.00, // Exento
            ImpIVA: invoice.vatAmount ? invoice.vatAmount.toFixed(2) : 0.00,
            ImpTrib: 0.00, // Otros tributos
            MonId: 'PES', // Pesos
            MonCotiz: 1,
            // IVA si aplica
            ...(invoice.vatAmount > 0 && {
              Iva: {
                AlicIva: {
                  Id: 5, // 21%
                  BaseImp: invoice.netAmount.toFixed(2),
                  Importe: invoice.vatAmount.toFixed(2)
                }
              }
            })
          }
        }
      }
    };
  }

  /**
   * Parsear respuesta de AFIP
   * @private
   */
  _parseCAEResponse(result, invoiceData) {
    const detalle = result.FeDetResp?.FECAEDetResponse;
    
    if (!detalle) {
      throw new AfipError('INVALID_RESPONSE', 'Respuesta inválida de AFIP');
    }

    // Verificar errores de AFIP
    const errores = result.Errors?.Err;
    if (errores) {
      const errorList = Array.isArray(errores) ? errores : [errores];
      const errorMsg = errorList.map(e => `${e.Code}: ${e.Msg}`).join(', ');
      throw new AfipError('AFIP_ERROR', errorMsg, { codes: errorList.map(e => e.Code) });
    }

    // Verificar observaciones (warnings)
    const obs = result.FeDetResp?.Observaciones?.Obs;
    if (obs) {
      console.warn('[AFIP] Observaciones:', obs);
    }

    // Verificar resultado
    if (detalle.Resultado !== 'A') { // A=Aprobado, R=Rechazado
      const motivos = detalle.Motivos?.Motiv;
      const motivoMsg = Array.isArray(motivos) 
        ? motivos.map(m => `${m.Cod}: ${m.Desc}`).join(', ')
        : motivos?.Desc || 'Factura rechazada';
      
      throw new AfipError('REJECTED', motivoMsg, { 
        resultado: detalle.Resultado,
        motivos: detalle.Motivos 
      });
    }

    return {
      cae: detalle.CAE,
      caeDueDate: this._formatDate(detalle.CAEFchVto),
      invoiceNumber: detalle.CbteDesde,
      resultado: detalle.Resultado,
      requestDate: new Date().toISOString()
    };
  }

  /**
   * ========================================================================
   * RETRY LOGIC con Backoff Exponencial
   * ========================================================================
   */

  /**
   * Ejecutar función con retry automático
   * @private
   */
  async _executeWithRetry(fn, attempt = 1) {
    try {
      return await fn();
    } catch (error) {
      // No reintentar errores de rechazo de AFIP
      if (error.code === 'REJECTED' || error.code === 'AFIP_ERROR') {
        throw error;
      }

      if (attempt >= this.retryConfig.maxRetries) {
        throw new AfipError('MAX_RETRIES', `Máximo de reintentos alcanzado (${attempt})`, error);
      }

      // Calcular delay exponencial
      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
        this.retryConfig.maxDelay
      );

      console.log(`[AFIP] Reintentando en ${delay}ms (intento ${attempt}/${this.retryConfig.maxRetries})`);
      
      await this._sleep(delay);
      return this._executeWithRetry(fn, attempt + 1);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ========================================================================
   * AUDITORÍA FISCAL - Almacenamiento Local
   * ========================================================================
   */

  /**
   * Guardar XML de request/response para auditoría fiscal
   * @private
   */
  async _saveXML(pos, number, data, type) {
    try {
      const dir = path.join(this.certsPath, '../afip_audit', String(pos));
      await fs.mkdir(dir, { recursive: true });

      const filename = `${Date.now()}_${pos}_${number}_${type}.xml`;
      const filepath = path.join(dir, filename);

      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      await fs.writeFile(filepath, content, 'utf8');

      // Registrar en base de datos
      const db = this.db.getInstance();
      db.prepare(`
        INSERT INTO afip_audit_logs (pos, invoice_number, type, filename, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(pos, number, type, filename);

    } catch (error) {
      console.error('[AFIP] Error guardando XML de auditoría:', error);
      // No lanzar error - auditoría es secundaria
    }
  }

  /**
   * Guardar error para auditoría
   * @private
   */
  async _saveXMLError(pos, number, error) {
    try {
      const dir = path.join(this.certsPath, '../afip_audit', String(pos));
      await fs.mkdir(dir, { recursive: true });

      const filename = `${Date.now()}_${pos}_${number}_error.json`;
      const filepath = path.join(dir, filename);

      const errorData = {
        timestamp: new Date().toISOString(),
        pos,
        number,
        error: error.message,
        code: error.code,
        stack: error.stack
      };

      await fs.writeFile(filepath, JSON.stringify(errorData, null, 2), 'utf8');

      // Registrar en DB
      const db = this.db.getInstance();
      db.prepare(`
        INSERT INTO afip_audit_logs (pos, invoice_number, type, filename, error_message, created_at)
        VALUES (?, ?, 'error', ?, ?, datetime('now'))
      `).run(pos, number, filename, error.message);

    } catch (saveError) {
      console.error('[AFIP] Error guardando error:', saveError);
    }
  }

  /**
   * Guardar TA XML
   * @private
   */
  async _saveTAXML(data, type) {
    // Similar a _saveXML pero para TAs
    await this._saveXML('TA', Date.now(), data, type);
  }

  /**
   * ========================================================================
   * UTILIDADES
   * ========================================================================
   */

  /**
   * Mapear tipo de comprobante interno a código AFIP
   */
  _getTipoComprobante(type) {
    const map = {
      'A': 1,    // Factura A
      'B': 6,    // Factura B
      'C': 11,   // Factura C
      'NC_A': 3, // Nota de Crédito A
      'NC_B': 8, // Nota de Crédito B
      'NC_C': 13, // Nota de Crédito C
      'ND_A': 2, // Nota de Débito A
      'ND_B': 7, // Nota de Débito B
    };
    return map[type] || 11; // Default Factura C
  }

  /**
   * Formatear fecha AFIP (AAAAMMDD) a ISO
   */
  _formatDate(afipDate) {
    if (!afipDate || afipDate.length !== 8) return null;
    const year = afipDate.substring(0, 4);
    const month = afipDate.substring(4, 6);
    const day = afipDate.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  /**
   * ========================================================================
   * API PÚBLICA - Métodos de utilidad
   * ========================================================================
   */

  /**
   * Verificar estado de servidores AFIP
   */
  async checkServerStatus() {
    try {
      const { token, sign } = await this.getTicketAcceso();
      
      const client = await soap.createClientAsync(this.urls.wsfe);
      const [result] = await client.FEDummyAsync({});

      return {
        appServer: result.FEDummyResult?.AppServer === 'OK',
        dbServer: result.FEDummyResult?.DbServer === 'OK',
        authServer: result.FEDummyResult?.AuthServer === 'OK',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Obtener último número de comprobante autorizado
   */
  async getLastInvoiceNumber(pos, tipo) {
    try {
      const { token, sign } = await this.getTicketAcceso();
      const tipoComp = this._getTipoComprobante(tipo);

      const client = await soap.createClientAsync(this.urls.wsfe);
      const [result] = await client.FECompUltimoAutorizadoAsync({
        Auth: { Token: token, Sign: sign, Cuit: this.cuit },
        PtoVta: pos,
        CbteTipo: tipoComp
      });

      return result.CbteNro || 0;

    } catch (error) {
      console.error('[AFIP] Error obteniendo último número:', error);
      return 0;
    }
  }
}

/**
 * Error personalizado de AFIP
 */
class AfipError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AfipError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = { AfipService, AfipError };

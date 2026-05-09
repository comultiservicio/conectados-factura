/**
 * AFIP Cron Service - Reintentos automáticos locales
 * 
 * @description Servicio cron local para reintentar facturas pendientes de AFIP.
 * Reemplaza AWS EventBridge con node-cron (100% local).
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 * 
 * ESTRATEGIA:
 * - Cada 5 minutos: Reintentar facturas en estado 'pending_afip'
 * - Backoff exponencial: 5min -> 15min -> 45min
 * - Máximo 5 intentos por factura
 * - Alerta después de 3 fallos consecutivos
 */

const cron = require('node-cron');
const { AfipService, AfipError } = require('./AfipService');

class AfipCronService {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.afipService = new AfipService(dbConnection);
    this.tasks = [];
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      lastRun: null
    };
  }

  /**
   * Iniciar todos los jobs cron
   */
  start() {
    console.log('[AfipCron] Iniciando servicio de reintentos AFIP...');

    // Job 1: Reintentar facturas pendientes cada 5 minutos
    const retryJob = cron.schedule('*/5 * * * *', async () => {
      await this.retryPendingInvoices();
    }, {
      scheduled: true,
      timezone: 'America/Argentina/Buenos_Aires'
    });

    // Job 2: Verificar estado de servidores AFIP cada 15 minutos
    const healthJob = cron.schedule('*/15 * * * *', async () => {
      await this.checkAfipHealth();
    }, {
      scheduled: true,
      timezone: 'America/Argentina/Buenos_Aires'
    });

    // Job 3: Generar reporte diario de actividad AFIP
    const reportJob = cron.schedule('0 23 * * *', async () => {
      await this.generateDailyReport();
    }, {
      scheduled: true,
      timezone: 'America/Argentina/Buenos_Aires'
    });

    this.tasks.push(retryJob, healthJob, reportJob);

    console.log('[AfipCron] Jobs iniciados:');
    console.log('  - Retry cada 5 minutos');
    console.log('  - Health check cada 15 minutos');
    console.log('  - Reporte diario a las 23:00');
  }

  /**
   * Detener todos los jobs
   */
  stop() {
    console.log('[AfipCron] Deteniendo jobs...');
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
  }

  /**
   * ========================================================================
   * JOB 1: Reintentar Facturas Pendientes
   * ========================================================================
   */

  async retryPendingInvoices() {
    const db = this.db.getInstance();
    
    try {
      // Buscar facturas pendientes con backoff respetado
      const pending = db.prepare(`
        SELECT i.*, a.attempts, a.last_attempt, a.next_retry
        FROM invoices i
        JOIN afip_pending a ON i.id = a.invoice_id
        WHERE i.afip_status = 'pending'
          AND (a.next_retry IS NULL OR datetime('now') >= a.next_retry)
          AND a.attempts < 5
        ORDER BY i.created_at ASC
        LIMIT 10
      `).all();

      if (pending.length === 0) return;

      console.log(`[AfipCron] Reintentando ${pending.length} factura(s) pendiente(s)`);

      for (const invoice of pending) {
        await this._processInvoice(invoice, db);
      }

      this.stats.lastRun = new Date().toISOString();

    } catch (error) {
      console.error('[AfipCron] Error en retry job:', error);
    }
  }

  /**
   * Procesar una factura individual
   * @private
   */
  async _processInvoice(invoice, db) {
    const startTime = Date.now();

    try {
      // Incrementar contador de intentos
      const attempts = invoice.attempts + 1;

      // Preparar datos para AFIP
      const invoiceData = {
        invoiceType: invoice.invoice_type,
        pos: invoice.pos_number,
        number: invoice.invoice_number,
        date: invoice.invoice_date,
        customerDocType: invoice.customer_doc_type || 99,
        customerDoc: invoice.customer_doc || 0,
        total: invoice.total_amount,
        netAmount: invoice.net_amount || invoice.total_amount,
        vatAmount: invoice.vat_amount || 0,
        items: JSON.parse(invoice.items || '[]')
      };

      // Llamar AFIP
      const result = await this.afipService.requestCAE(invoiceData);

      // Éxito: Actualizar factura
      db.prepare(`
        UPDATE invoices 
        SET afip_status = 'authorized',
            afip_cae = ?,
            afip_cae_due_date = ?,
            afip_response_date = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(result.cae, result.caeDueDate, invoice.id);

      // Eliminar de pendientes
      db.prepare(`DELETE FROM afip_pending WHERE invoice_id = ?`).run(invoice.id);

      // Registrar éxito
      this._logAfipEvent(invoice.id, 'SUCCESS', 'CAE obtenido', {
        cae: result.cae,
        duration: Date.now() - startTime,
        attempts
      }, db);

      this.stats.successful++;
      console.log(`[AfipCron] ✅ Factura ${invoice.invoice_number} autorizada (CAE: ${result.cae})`);

    } catch (error) {
      await this._handleRetryFailure(invoice, error, db, startTime);
    }
  }

  /**
   * Manejar fallo de reintento
   * @private
   */
  async _handleRetryFailure(invoice, error, db, startTime) {
    const attempts = invoice.attempts + 1;
    
    // Calcular próximo retry con backoff exponencial
    // 1: 5min, 2: 15min, 3: 45min, 4: 2h, 5: desistir
    const delays = [5, 15, 45, 120, 0]; // minutos, 0 = no más reintentos
    const nextDelay = delays[Math.min(attempts - 1, delays.length - 1)];
    
    const nextRetry = nextDelay > 0 
      ? new Date(Date.now() + nextDelay * 60 * 1000).toISOString()
      : null;

    // Actualizar registro de pendientes
    db.prepare(`
      UPDATE afip_pending 
      SET attempts = ?,
          last_attempt = datetime('now'),
          next_retry = ?,
          last_error = ?,
          error_code = ?
      WHERE invoice_id = ?
    `).run(attempts, nextRetry, error.message, error.code, invoice.id);

    // Si alcanzó máximo de intentos
    if (attempts >= 5) {
      db.prepare(`
        UPDATE invoices 
        SET afip_status = 'failed',
            afip_error = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(error.message, invoice.id);

      // Alerta: Notificar admin (guardar en tabla de alertas)
      this._createAlert('AFIP_RETRY_EXHAUSTED', 
        `Factura ${invoice.invoice_number} falló después de 5 intentos`,
        { invoice_id: invoice.id, error: error.message },
        db
      );

      this.stats.failed++;
      console.error(`[AfipCron] ❌ Factura ${invoice.invoice_number} AGOTÓ reintentos: ${error.message}`);

    } else {
      // Seguir reintentando
      this._logAfipEvent(invoice.id, 'RETRY_FAILED', error.message, {
        attempts,
        nextRetry,
        errorCode: error.code,
        duration: Date.now() - startTime
      }, db);

      console.log(`[AfipCron] ⚠️ Factura ${invoice.invoice_number} falló (${attempts}/5), próximo: ${nextDelay}min`);
    }
  }

  /**
   * ========================================================================
   * JOB 2: Health Check AFIP
   * ========================================================================
   */

  async checkAfipHealth() {
    try {
      const status = await this.afipService.checkServerStatus();
      const db = this.db.getInstance();

      // Guardar estado en DB
      db.prepare(`
        INSERT INTO afip_health_logs (app_server, db_server, auth_server, checked_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(
        status.appServer ? 1 : 0,
        status.dbServer ? 1 : 0,
        status.authServer ? 1 : 0
      );

      // Alertar si hay problemas
      if (!status.appServer || !status.dbServer || !status.authServer) {
        const issues = [];
        if (!status.appServer) issues.push('App Server');
        if (!status.dbServer) issues.push('DB Server');
        if (!status.authServer) issues.push('Auth Server');

        this._createAlert('AFIP_SERVERS_DOWN',
          `Servidores AFIP con problemas: ${issues.join(', ')}`,
          status,
          db
        );

        console.error('[AfipCron] 🚨 Alerta: Servidores AFIP con problemas:', issues);
      } else {
        console.log('[AfipCron] ✅ Servidores AFIP OK');
      }

    } catch (error) {
      console.error('[AfipCron] Error en health check:', error);
    }
  }

  /**
   * ========================================================================
   * JOB 3: Reporte Diario
   * ========================================================================
   */

  async generateDailyReport() {
    try {
      const db = this.db.getInstance();
      const today = new Date().toISOString().split('T')[0];

      // Estadísticas del día
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'authorized' THEN 1 ELSE 0 END) as authorized,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          AVG(CASE WHEN response_ms > 0 THEN response_ms END) as avg_response_ms
        FROM afip_logs
        WHERE date(created_at) = date('now')
      `).get();

      // Guardar reporte
      db.prepare(`
        INSERT INTO afip_daily_reports 
          (report_date, total_invoices, authorized, failed, pending, avg_response_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        today,
        stats.total || 0,
        stats.authorized || 0,
        stats.failed || 0,
        stats.pending || 0,
        Math.round(stats.avg_response_ms || 0)
      );

      console.log('[AfipCron] 📊 Reporte diario generado:', {
        date: today,
        total: stats.total,
        authorized: stats.authorized,
        failed: stats.failed
      });

      // Resetear estadísticas del servicio
      this.stats = {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        lastRun: this.stats.lastRun
      };

    } catch (error) {
      console.error('[AfipCron] Error generando reporte:', error);
    }
  }

  /**
   * ========================================================================
   * UTILIDADES PRIVADAS
   * ========================================================================
   */

  _logAfipEvent(invoiceId, eventType, message, details, db) {
    try {
      db.prepare(`
        INSERT INTO afip_logs 
          (invoice_id, event_type, message, details, response_ms, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        invoiceId,
        eventType,
        message,
        JSON.stringify(details),
        details.duration || 0
      );
    } catch (error) {
      console.error('[AfipCron] Error guardando log:', error);
    }
  }

  _createAlert(type, message, data, db) {
    try {
      db.prepare(`
        INSERT INTO system_alerts 
          (alert_type, message, data, acknowledged, created_at)
        VALUES (?, ?, ?, 0, datetime('now'))
      `).run(type, message, JSON.stringify(data));
    } catch (error) {
      console.error('[AfipCron] Error creando alerta:', error);
    }
  }

  /**
   * ========================================================================
   * API PÚBLICA - Estadísticas y Control
   * ========================================================================
   */

  getStats() {
    return {
      ...this.stats,
      running: this.tasks.length > 0,
      tasksCount: this.tasks.length
    };
  }

  /**
   * Forzar reintento inmediato de una factura específica
   */
  async forceRetry(invoiceId) {
    const db = this.db.getInstance();
    
    const invoice = db.prepare(`
      SELECT i.*, a.attempts, a.last_attempt
      FROM invoices i
      JOIN afip_pending a ON i.id = a.invoice_id
      WHERE i.id = ?
    `).get(invoiceId);

    if (!invoice) {
      throw new Error('Factura no encontrada o no está pendiente');
    }

    console.log(`[AfipCron] Forzando reintento manual de factura ${invoice.invoice_number}`);
    await this._processInvoice(invoice, db);
    
    return { success: invoice.afip_status === 'authorized' };
  }
}

module.exports = { AfipCronService };

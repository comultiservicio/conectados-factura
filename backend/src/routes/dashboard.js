const express = require('express');
const authMiddleware = require('../middleware/auth');
const InvoiceService = require('../services/InvoiceService');

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Dashboard stats: total sales, today, by type, pending sync
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const db = InvoiceService.db;
    
    // Total de ventas (todas las facturas)
    const totalSales = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as amount,
        COALESCE(SUM(subtotal), 0) as subtotal,
        COALESCE(SUM(iva), 0) as iva
      FROM facturas
      WHERE estado = 'emitida'
    `).get();

    // Ventas de hoy
    const todaySales = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as amount
      FROM facturas 
      WHERE DATE(created_at) = DATE('now')
      AND estado = 'emitida'
    `).get();

    // Ventas por tipo (A, B, C)
    const byType = db.prepare(`
      SELECT 
        type,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as amount
      FROM facturas
      WHERE estado = 'emitida'
      GROUP BY type
    `).all();

    // Últimas 7 días
    const last7Days = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as amount
      FROM facturas
      WHERE created_at >= DATE('now', '-7 days')
      AND estado = 'emitida'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();

    // Pendientes de sincronización
    const pendingSync = db.prepare(`
      SELECT COUNT(*) as count FROM facturas WHERE synced = 0
    `).get();

    // Facturas pendientes detalle
    const pendingDetails = db.prepare(`
      SELECT 
        id, full_number, type, total, created_at
      FROM facturas 
      WHERE synced = 0
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    res.json({
      success: true,
      data: {
        summary: {
          total_invoices: totalSales.count,
          total_amount: totalSales.amount,
          total_subtotal: totalSales.subtotal,
          total_iva: totalSales.iva,
          today_count: todaySales.count,
          today_amount: todaySales.amount,
          pending_sync: pendingSync.count
        },
        by_type: byType,
        last_7_days: last7Days,
        pending_details: pendingDetails
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/activity
 * Recent activity (last invoices, sync status)
 */
router.get('/activity', authMiddleware, async (req, res, next) => {
  try {
    const db = InvoiceService.db;
    
    // Últimas 10 facturas
    const recentInvoices = db.prepare(`
      SELECT 
        f.id, f.full_number, f.type, f.total, f.cliente_nombre,
        f.created_at, f.synced,
        u.name as user_name
      FROM facturas f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.created_at DESC
      LIMIT 10
    `).all();

    // Actividad de sync
    const syncActivity = db.prepare(`
      SELECT 
        entity,
        action,
        synced,
        sync_attempts,
        created_at
      FROM sync_queue
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      data: {
        recent_invoices: recentInvoices,
        sync_activity: syncActivity
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

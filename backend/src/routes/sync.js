const express = require('express');
const authMiddleware = require('../middleware/auth');
const InvoiceService = require('../services/InvoiceService');
const SyncService = require('../services/SyncService');

const router = express.Router();

/**
 * POST /api/sync
 * PRO Sync endpoint with conflict resolution
 * Strategy: last_write_wins (configurable)
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { items, client_id, pos_prefix, strategy = 'last_write_wins' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de items para sincronizar'
      });
    }

    // Process incoming sync with conflict resolution
    const results = SyncService.processIncomingSync(items, client_id, strategy);

    // Identify successful syncs
    const successfulIds = results
      .filter(r => r.status === 'created' || r.status === 'updated' || r.status === 'ok')
      .map(r => r.id);

    // Mark as synced
    if (successfulIds.length > 0) {
      SyncService.markAsSynced(successfulIds);
    }

    // Record errors for failed items
    const failedItems = results.filter(r => r.status === 'error');
    for (const item of failedItems) {
      const queueItem = items.find(i => i.id === item.id);
      if (queueItem) {
        SyncService.recordError(item.id, { message: item.error });
      }
    }

    res.json({
      success: true,
      message: `Sincronización: ${successfulIds.length} OK, ${failedItems.length} errores, ${results.filter(r => r.conflict_resolved).length} conflictos resueltos`,
      results,
      summary: {
        total: items.length,
        successful: successfulIds.length,
        failed: failedItems.length,
        conflicts: results.filter(r => r.conflict_resolved).length
      },
      client_id,
      pos_prefix
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/status
 * Get comprehensive sync status
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const syncStats = SyncService.getStats();
    const pendingItems = SyncService.getPendingItems(10);
    const failedItems = SyncService.getFailedItems();

    res.json({
      success: true,
      data: {
        stats: syncStats,
        pending_items: pendingItems,
        failed_items: failedItems,
        last_check: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/queue
 * Get full sync queue with detailed status
 */
router.get('/queue', authMiddleware, async (req, res, next) => {
  try {
    const { synced, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM sync_queue';
    const params = [];

    if (synced !== undefined) {
      query += ' WHERE synced = ?';
      params.push(synced === 'true' || synced === '1' ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit) || 50);

    const items = SyncService.db.prepare(query).all(...params);

    res.json({
      success: true,
      data: items.map(item => ({
        ...item,
        data: JSON.parse(item.data || '{}'),
        status: item.synced ? 'synced' : 
                item.sync_attempts >= 5 ? 'failed' : 
                item.sync_attempts > 0 ? 'retrying' : 'pending'
      })),
      count: items.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sync/retry
 * Retry failed sync items
 */
router.post('/retry', authMiddleware, async (req, res, next) => {
  try {
    const result = SyncService.retryFailed();
    
    res.json({
      success: true,
      message: `${result.reset} items marcados para reintentar`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sync/purge
 * Clean up old synced items
 */
router.post('/purge', authMiddleware, async (req, res, next) => {
  try {
    const { days = 30 } = req.body;
    const result = SyncService.purgeOldSynced(days);
    
    res.json({
      success: true,
      message: `${result.deleted} items antiguos eliminados`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

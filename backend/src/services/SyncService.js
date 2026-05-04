const dbConnection = require('../database/connection');

class SyncService {
  constructor() {
    this.db = dbConnection.getInstance();
  }

  /**
   * Get all pending items to sync
   */
  getPendingItems(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_queue 
      WHERE synced = 0 
      AND (sync_attempts < 5 OR last_error IS NULL)
      ORDER BY created_at ASC
      LIMIT ?
    `);
    
    const items = stmt.all(limit);
    
    return items.map(item => ({
      ...item,
      data: JSON.parse(item.data || '{}')
    }));
  }

  /**
   * Get items with errors (failed syncs)
   */
  getFailedItems() {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_queue 
      WHERE synced = 0 
      AND sync_attempts >= 5
      ORDER BY created_at DESC
    `);
    
    const items = stmt.all();
    
    return items.map(item => ({
      ...item,
      data: JSON.parse(item.data || '{}')
    }));
  }

  /**
   * Mark items as successfully synced
   */
  markAsSynced(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    
    const placeholders = ids.map(() => '?').join(',');
    
    const updateStmt = this.db.prepare(`
      UPDATE sync_queue 
      SET synced = 1, 
          sync_attempts = sync_attempts + 1,
          last_error = NULL
      WHERE id IN (${placeholders})
    `);
    
    const result = updateStmt.run(...ids);
    
    // Also update corresponding entities
    const getEntities = this.db.prepare(`
      SELECT entity, entity_id FROM sync_queue WHERE id IN (${placeholders})
    `);
    const entities = getEntities.all(...ids);
    
    // Mark facturas as synced
    const facturaIds = entities
      .filter(e => e.entity === 'facturas' || e.entity === 'invoice')
      .map(e => e.entity_id);
    
    if (facturaIds.length > 0) {
      const factPlaceholders = facturaIds.map(() => '?').join(',');
      const updateFacturas = this.db.prepare(`
        UPDATE facturas 
        SET synced = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${factPlaceholders})
      `);
      updateFacturas.run(...facturaIds);
    }
    
    return { updated: result.changes };
  }

  /**
   * Record sync error and increment retry count
   */
  recordError(id, error) {
    const stmt = this.db.prepare(`
      UPDATE sync_queue 
      SET sync_attempts = sync_attempts + 1,
          last_error = ?
      WHERE id = ?
    `);
    
    stmt.run(error.message || String(error), id);
    
    // If too many retries, log to sync_logs
    const checkStmt = this.db.prepare(`
      SELECT sync_attempts FROM sync_queue WHERE id = ?
    `);
    const result = checkStmt.get(id);
    
    if (result && result.sync_attempts >= 5) {
      this.logPermanentError(id);
    }
    
    return result?.sync_attempts || 0;
  }

  /**
   * Log permanent errors for manual review
   */
  logPermanentError(queueId) {
    const item = this.db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId);
    if (!item) return;
    
    this.db.prepare(`
      INSERT INTO sync_logs (table_name, record_id, action, payload, synced, last_error)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(
      item.entity,
      item.entity_id,
      item.action,
      item.data,
      item.last_error
    );
  }

  /**
   * Resolve conflicts using "last write wins" strategy
   * Returns: local wins, remote wins, or merged
   */
  resolveConflict(localData, remoteData, strategy = 'last_write_wins') {
    const localTime = new Date(localData.updated_at || localData.created_at);
    const remoteTime = new Date(remoteData.updated_at || remoteData.created_at);
    
    switch (strategy) {
      case 'last_write_wins':
        // Compare timestamps
        if (localTime >= remoteTime) {
          return { winner: 'local', data: localData };
        } else {
          return { winner: 'remote', data: remoteData };
        }
      
      case 'local_wins':
        return { winner: 'local', data: localData };
      
      case 'remote_wins':
        return { winner: 'remote', data: remoteData };
      
      default:
        return { winner: 'local', data: localData };
    }
  }

  /**
   * Process incoming sync data from client
   * Handles conflicts and applies changes
   */
  processIncomingSync(items, clientId, strategy = 'last_write_wins') {
    const results = [];
    
    for (const item of items) {
      try {
        const result = this.processSyncItem(item, strategy);
        results.push({
          id: item.id,
          entity: item.entity,
          status: result.status,
          conflict_resolved: result.conflict || false,
          winner: result.winner || null
        });
      } catch (error) {
        results.push({
          id: item.id,
          entity: item.entity,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Process a single sync item
   */
  processSyncItem(item, strategy) {
    const { entity, entity_id, action, data } = item;
    
    // Check if entity exists locally
    let existing = null;
    
    if (entity === 'facturas' || entity === 'invoice') {
      existing = this.db.prepare('SELECT * FROM facturas WHERE id = ?').get(entity_id);
    }
    
    // If no conflict, simple insert/update
    if (!existing) {
      // New record - insert
      return { status: 'created', conflict: false };
    }
    
    // Conflict detected - resolve
    const resolution = this.resolveConflict(data, existing, strategy);
    
    return {
      status: resolution.winner === 'local' ? 'updated' : 'skipped',
      conflict: true,
      winner: resolution.winner
    };
  }

  /**
   * Get sync statistics
   */
  getStats() {
    const pending = this.db.prepare(`
      SELECT COUNT(*) as count, 
             AVG(sync_attempts) as avg_attempts
      FROM sync_queue 
      WHERE synced = 0
    `).get();
    
    const failed = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM sync_queue 
      WHERE synced = 0 AND sync_attempts >= 5
    `).get();
    
    const synced = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM sync_queue 
      WHERE synced = 1
    `).get();
    
    const byEntity = this.db.prepare(`
      SELECT entity, COUNT(*) as count
      FROM sync_queue
      WHERE synced = 0
      GROUP BY entity
    `).all();
    
    return {
      pending: pending.count,
      avg_attempts: Math.round(pending.avg_attempts || 0),
      failed: failed.count,
      synced: synced.count,
      by_entity: byEntity
    };
  }

  /**
   * Retry failed items (reset attempt count)
   */
  retryFailed() {
    const stmt = this.db.prepare(`
      UPDATE sync_queue 
      SET sync_attempts = 0, last_error = NULL
      WHERE synced = 0 AND sync_attempts >= 5
    `);
    
    const result = stmt.run();
    return { reset: result.changes };
  }

  /**
   * Purge old synced items (cleanup)
   */
  purgeOldSynced(days = 30) {
    const stmt = this.db.prepare(`
      DELETE FROM sync_queue 
      WHERE synced = 1 
      AND created_at < DATE('now', '-${days} days')
    `);
    
    const result = stmt.run();
    return { deleted: result.changes };
  }
}

module.exports = new SyncService();

const express = require('express');
const authMiddleware = require('../middleware/auth');
const InvoiceService = require('../services/InvoiceService');

const router = express.Router();

/**
 * GET /api/debug/invoice-check
 * Diagnostic endpoint to verify invoice numbering integrity
 */
router.get('/invoice-check', authMiddleware, (req, res) => {
  try {
    const db = InvoiceService.db;
    
    // 1. Last invoice per type/POS
    const lastInvoices = db.prepare(`
      SELECT 
        type, 
        pos_prefix,
        MAX(number) as last_number,
        COUNT(*) as total_count,
        MAX(full_number) as last_full_number,
        MAX(created_at) as last_created
      FROM facturas
      GROUP BY type, pos_prefix
      ORDER BY pos_prefix, type
    `).all();

    // 2. Check for duplicates (should never happen, but verify)
    const duplicates = db.prepare(`
      SELECT full_number, COUNT(*) as count
      FROM facturas
      GROUP BY full_number
      HAVING count > 1
    `).all();

    // 3. Check sequence integrity
    const sequences = db.prepare(`
      SELECT type, pos_prefix, last_number
      FROM invoice_sequences
      ORDER BY pos_prefix, type
    `).all();

    // 4. Verify sequence matches actual invoices
    const integrityCheck = sequences.map(seq => {
      const actual = lastInvoices.find(
        inv => inv.type === seq.type && inv.pos_prefix === seq.pos_prefix
      );
      
      return {
        type: seq.type,
        pos_prefix: seq.pos_prefix,
        sequence_last: seq.last_number,
        actual_last: actual?.last_number || 0,
        is_valid: seq.last_number === (actual?.last_number || 0),
        gap_detected: seq.last_number !== (actual?.last_number || 0)
      };
    });

    // 5. Recent invoices with hashes
    const recent = db.prepare(`
      SELECT 
        id, full_number, type, pos_prefix, 
        number, total, hash, synced,
        created_at, updated_at
      FROM facturas
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    // 6. Sync queue status
    const syncStatus = db.prepare(`
      SELECT 
        synced,
        COUNT(*) as count,
        AVG(sync_attempts) as avg_attempts
      FROM sync_queue
      GROUP BY synced
    `).all();

    // 7. Calculate hash verification sample
    const hashSample = recent.map(inv => {
      const expectedHash = InvoiceService.generateHash({
        number: inv.number,
        type: inv.type,
        pos_prefix: inv.pos_prefix,
        full_number: inv.full_number,
        total: inv.total,
        items: [],
        fecha: inv.created_at?.split('T')[0],
        cliente_cuit: null
      });
      
      return {
        full_number: inv.full_number,
        stored_hash: inv.hash,
        hash_valid: inv.hash === expectedHash,
        hash_prefix: inv.hash?.substring(0, 16) + '...'
      };
    });

    // Overall health
    const hasDuplicates = duplicates.length > 0;
    const hasGaps = integrityCheck.some(check => check.gap_detected);
    const hashesValid = hashSample.every(h => h.hash_valid);

    res.json({
      success: true,
      data: {
        health: {
          status: hasDuplicates || hasGaps ? 'WARNING' : 'HEALTHY',
          duplicates_detected: hasDuplicates,
          sequence_gaps: hasGaps,
          hashes_valid: hashesValid,
          timestamp: new Date().toISOString()
        },
        last_invoices: lastInvoices,
        sequences: sequences,
        integrity: integrityCheck,
        recent_invoices: recent,
        sync_status: syncStatus,
        hash_verification: hashSample,
        duplicates: duplicates.length > 0 ? duplicates : null,
        total_invoices: db.prepare('SELECT COUNT(*) as count FROM facturas').get().count
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/debug/verify-hash/:id
 * Verify specific invoice hash
 */
router.get('/verify-hash/:id', authMiddleware, (req, res) => {
  try {
    const db = InvoiceService.db;
    const invoice = db.prepare(`
      SELECT * FROM facturas WHERE id = ?
    `).get(req.params.id);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const expectedHash = InvoiceService.generateHash({
      number: invoice.number,
      type: invoice.type,
      pos_prefix: invoice.pos_prefix,
      full_number: invoice.full_number,
      total: invoice.total,
      items: JSON.parse(invoice.items || '[]'),
      fecha: invoice.fecha,
      cliente_cuit: invoice.cliente_cuit
    });

    res.json({
      success: true,
      data: {
        invoice_id: invoice.id,
        full_number: invoice.full_number,
        stored_hash: invoice.hash,
        expected_hash: expectedHash,
        valid: invoice.hash === expectedHash
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

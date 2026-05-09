const express = require('express');
const authRoutes = require('./auth');
const invoiceRoutes = require('./invoices');
const syncRoutes = require('./sync');
const dashboardRoutes = require('./dashboard');
const versionRoutes = require('./version');
const debugRoutes = require('./debug');
const healthRoutes = require('./health');
const afipRoutes = require('./afip');

const router = express.Router();

// Health check endpoint
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);

// Invoice routes with sequential numbering (Argentina compliant)
router.use('/invoices', invoiceRoutes);

// AFIP fiscal integration routes (WSFEv1)
router.use('/afip', afipRoutes);

// Dashboard stats
router.use('/dashboard', dashboardRoutes);

// Sync routes for offline-first (PRO with conflict resolution)
router.use('/sync', syncRoutes);

// Version endpoint for auto-update
router.use('/version', versionRoutes);

// Debug endpoints (production diagnostics)
router.use('/debug', debugRoutes);

// Keep old facturas route for backwards compatibility
router.use('/facturas', invoiceRoutes);

module.exports = router;
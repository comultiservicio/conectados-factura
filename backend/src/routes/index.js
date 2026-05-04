const express = require('express');
const authRoutes = require('./auth');
const invoiceRoutes = require('./invoices');
const syncRoutes = require('./sync');
const dashboardRoutes = require('./dashboard');
const versionRoutes = require('./version');

const router = express.Router();

// Auth routes
router.use('/auth', authRoutes);

// Invoice routes with sequential numbering (Argentina compliant)
router.use('/invoices', invoiceRoutes);

// Dashboard stats
router.use('/dashboard', dashboardRoutes);

// Sync routes for offline-first (PRO with conflict resolution)
router.use('/sync', syncRoutes);

// Version endpoint for auto-update
router.use('/version', versionRoutes);

// Keep old facturas route for backwards compatibility
router.use('/facturas', invoiceRoutes);

module.exports = router;
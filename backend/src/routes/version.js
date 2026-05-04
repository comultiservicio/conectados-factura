const express = require('express');
const config = require('../config');

const router = express.Router();

/**
 * GET /api/version
 * Return current version info for auto-update system
 */
router.get('/', (req, res) => {
  const packageJson = require('../../package.json');
  
  res.json({
    success: true,
    data: {
      version: packageJson.version,
      name: packageJson.name,
      build_date: new Date().toISOString(),
      update_url: process.env.UPDATE_URL || null,
      min_client_version: process.env.MIN_CLIENT_VERSION || packageJson.version,
      changelog: [
        'Sistema de facturación Argentina offline-first',
        'Numeración continua garantizada',
        'Sync con resolución de conflictos',
        'Multi-POS support'
      ],
      env: config.nodeEnv
    }
  });
});

/**
 * GET /api/version/check
 * Check if update is needed
 * Client sends: { version: "1.0.0" }
 */
router.get('/check', (req, res) => {
  const packageJson = require('../../package.json');
  const clientVersion = req.query.version || '0.0.0';
  const serverVersion = packageJson.version;
  
  // Simple version comparison (for production, use semver)
  const needsUpdate = clientVersion !== serverVersion;
  
  res.json({
    success: true,
    data: {
      current_version: clientVersion,
      server_version: serverVersion,
      needs_update: needsUpdate,
      download_url: needsUpdate ? (process.env.UPDATE_URL || null) : null,
      mandatory: false,
      message: needsUpdate ? 'Nueva versión disponible' : 'Estás en la última versión'
    }
  });
});

module.exports = router;

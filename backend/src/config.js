const path = require('path');

function resolveDbPath(dbPath) {
  if (!dbPath) {
    return path.resolve(process.cwd(), 'data', 'factura.db');
  }

  if (path.isAbsolute(dbPath)) {
    return dbPath;
  }

  return path.resolve(process.cwd(), dbPath);
}

/**
 * SECURITY: JWT_SECRET must be set in environment
 * ERROR 4 FIX: No fallback - enforce secure configuration
 */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}

const config = {
  port: Number(process.env.PORT) || 3001,
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  dbPath: resolveDbPath(process.env.DB_PATH || './data/factura.db'),
  nodeEnv: process.env.NODE_ENV || 'development'
};

module.exports = config;
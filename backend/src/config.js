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

const config = {
  port: Number(process.env.PORT) || 3001,
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  dbPath: resolveDbPath(process.env.DB_PATH || './data/factura.db'),
  nodeEnv: process.env.NODE_ENV || 'development'
};

module.exports = config;
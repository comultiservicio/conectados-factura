require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const db = require('./database/connection');
const { initializeDatabase, closeDatabase } = require('./db');
const apiRoutes = require('./routes');
const healthRoutes = require('./routes/health');
const errorHandler = require('./middleware/errorHandler');
const { AfipCronService } = require('./services/AfipCronService');

const app = express();

/**
 * ========================================================================
 * SECURITY: CORS CONFIGURATION
 * ========================================================================
 * ERROR 3 FIX: Restrict CORS origins in production
 */
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:4173',
      'app://.',
      'http://localhost',
      'http://127.0.0.1'
    ]
  : true;

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || allowedOrigins === true) {
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use(errorHandler);

/**
 * ========================================================================
 * ERROR 5: DATABASE VALIDATION
 * ========================================================================
 * Validate database integrity before starting server
 */
async function validateDatabase() {
  const requiredTables = [
    'users',
    'companies',
    'products',
    'customers',
    'invoices',
    'invoice_items',
    'stock_movements',
    'cash_closings',
    'cash_movements',
    'afip_pending',
    'afip_logs'
  ];

  // Connect legacy db
  db.connect();
  
  // Initialize new db manager with migrations
  await initializeDatabase();

  for (const table of requiredTables) {
    const exists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table);

    if (!exists) {
      throw new Error(`FATAL: Required table '${table}' missing. Run migrations.`);
    }
  }

  // Verificar integridad física
  const check = db.prepare('PRAGMA integrity_check').get();
  if (check.integrity_check !== 'ok') {
    throw new Error(`Database integrity check failed: ${check.integrity_check}`);
  }

  console.log('✅ Database integrity verified');
}

/**
 * ========================================================================
 * ERROR 6: GRACEFUL SHUTDOWN
 * ========================================================================
 * Handle SIGTERM/SIGINT for clean shutdown
 */
let server = null;
let afipCronService = null;
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('[Server] HTTP server closed');
      
      // Close database connections
      db.close();
      console.log('[Server] Database connections closed');
      
      // Close new db manager
      closeDatabase().catch(err => {
        console.error('[Server] Error closing db manager:', err);
      });
      
      // Stop AFIP cron
      if (afipCronService) {
        afipCronService.stop();
        console.log('[Server] AFIP cron stopped');
      }
      
      console.log('[Server] ✅ Graceful shutdown complete');
      process.exit(0);
    });
  }

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('[Server] ❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

/**
 * ========================================================================
 * SERVER STARTUP
 * ========================================================================
 */
async function startServer() {
  try {
    // Validate database before starting
    await validateDatabase();

    // Initialize AFIP Cron service
    if (process.env.AFIP_CUIT && process.env.AFIP_ENV) {
      afipCronService = new AfipCronService(db);
      afipCronService.start();
      console.log('[Server] AFIP Cron service initialized');
    } else {
      console.log('[Server] AFIP not configured - skipping cron service');
    }

    // Start HTTP server
    server = app.listen(config.port, () => {
      console.log(`✅ Backend listening on port ${config.port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`AFIP Mode: ${process.env.AFIP_ENV || 'not configured'}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();
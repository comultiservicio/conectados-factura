require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const db = require('./database/connection');
const apiRoutes = require('./routes');
const healthRoutes = require('./routes/health');
const errorHandler = require('./middleware/errorHandler');
const { AfipCronService } = require('./services/AfipCronService');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use(errorHandler);

// Conectar a la base de datos
db.connect();

// Inicializar servicio AFIP Cron (si está configurado)
let afipCronService = null;

if (process.env.AFIP_CUIT && process.env.AFIP_ENV) {
  afipCronService = new AfipCronService(db);
  afipCronService.start();
  console.log('[Server] AFIP Cron service initialized');
} else {
  console.log('[Server] AFIP not configured - skipping cron service');
  console.log('[Server] Set AFIP_CUIT and AFIP_ENV to enable AFIP integration');
}

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`AFIP Mode: ${process.env.AFIP_ENV || 'not configured'}`);
});
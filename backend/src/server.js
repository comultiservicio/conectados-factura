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

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use(errorHandler);

db.connect();

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
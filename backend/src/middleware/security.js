/**
 * Middleware de Seguridad - Headers HTTP y protección
 * @module middleware/security
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');

/**
 * Configuración de Helmet para headers de seguridad
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", process.env.API_URL || "http://localhost:3000"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Deshabilitar para permitir imágenes locales
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  xXssProtection: "1; mode=block",
  permissionsPolicy: {
    features: {
      camera: ["'self'"],
      geolocation: ["'none'"],
      microphone: ["'none'"]
    }
  }
});

/**
 * Rate limiting para API
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: {
    error: 'Too many requests',
    message: 'Por favor intente más tarde'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Ha excedido el límite de peticiones. Intente más tarde.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * Rate limiting más estricto para auth
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 intentos de login
  skipSuccessfulRequests: true, // No contar logins exitosos
  message: {
    error: 'Too many login attempts',
    message: 'Demasiados intentos de login. Por favor espere 15 minutos.'
  }
});

/**
 * CORS configuración
 */
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://192.168.15.80',
    'https://conectados-factura.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key'
  ],
  credentials: true,
  maxAge: 86400, // 24 horas
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/**
 * Middleware para sanitizar inputs
 */
const sanitizeInput = (req, res, next) => {
  // Limpiar body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Limpiar query params
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  // Limpiar params
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

/**
 * Función recursiva para sanitizar objetos
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitizar clave también
    const cleanKey = sanitizeString(key);
    sanitized[cleanKey] = sanitizeObject(value);
  }
  
  return sanitized;
}

/**
 * Sanitiza un string contra XSS y SQL injection básico
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  
  return str
    // Prevenir XSS
    .replace(/[<>]/g, '')
    // Prevenir SQL injection básico
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    // Prevenir null bytes
    .replace(/\x00/g, '');
}

/**
 * Middleware para prevenir SQL injection en queries específicas
 */
const preventSQLInjection = (req, res, next) => {
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'UNION',
    'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE'
  ];
  
  const checkForSQL = (obj) => {
    for (const value of Object.values(obj)) {
      if (typeof value === 'string') {
        const upperValue = value.toUpperCase();
        for (const keyword of sqlKeywords) {
          if (upperValue.includes(keyword)) {
            return true;
          }
        }
      }
    }
    return false;
  };
  
  if (checkForSQL(req.body) || checkForSQL(req.query)) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'Se detectaron palabras reservadas de SQL'
    });
  }
  
  next();
};

/**
 * Middleware para logging de requests (audit)
 */
const auditLog = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || null,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    };
    
    // Log a archivo de auditoría
    const logLine = JSON.stringify(logEntry) + '\n';
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, '../../logs/audit.log');
    
    fs.appendFile(logFile, logLine, (err) => {
      if (err) console.error('Error en audit log:', err);
    });
  });
  
  next();
};

/**
 * Middleware para verificar API Key en rutas sensibles
 */
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY || 'conectados-dev-key';
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API Key inválida o faltante'
    });
  }
  
  next();
};

/**
 * Exportar todos los middlewares
 */
module.exports = {
  securityHeaders,
  apiLimiter,
  authLimiter,
  corsMiddleware: cors(corsOptions),
  hpp: hpp(), // HTTP Parameter Pollution prevention
  mongoSanitize: mongoSanitize(),
  sanitizeInput,
  preventSQLInjection,
  auditLog,
  requireApiKey
};

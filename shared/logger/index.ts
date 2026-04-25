import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      format: winston.format.json()
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.json()
    })
  ],
  // Avoid logging sensitive data
  defaultMeta: {
    service: 'conectados-factura'
  }
});

// Helper functions for structured logging
export const logError = (message: string, context: Record<string, any>) => {
  logger.error(message, {
    ...context,
    // Remove sensitive fields
    password: undefined,
    token: undefined,
    creditCard: undefined,
    bankAccount: undefined,
    socialSecurity: undefined
  });
};

export const logInfo = (message: string, context: Record<string, any>) => {
  logger.info(message, context);
};

export const logWarn = (message: string, context: Record<string, any>) => {
  logger.warn(message, context);
};

export const logMetric = (operation: string, duration: number, success: boolean, userId?: string) => {
  logger.info('Operation completed', {
    operation,
    duration,
    success,
    userId: userId ? userId.substring(0, 8) + '...' : undefined, // Partially mask userId
    timestamp: new Date().toISOString()
  });
};

/**
 * Winston Logger Configuration for Railway
 * Structured JSON logging for production monitoring
 */

const winston = require('winston');

// Log levels for Railway monitoring
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'railway-collector',
      environment: process.env.NODE_ENV || 'development',
      ...meta
    };
    
    return JSON.stringify(logEntry);
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: LOG_LEVELS,
  format: logFormat,
  defaultMeta: { 
    service: 'railway-collector',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Console transport for Railway logs
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
  exitOnError: false
});

// Add file transport for local development
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

/**
 * Log collection metrics
 * @param {Object} metrics - Collection metrics
 */
function logCollectionMetrics(metrics) {
  logger.info('Collection metrics', {
    type: 'collection_metrics',
    ...metrics
  });
}

/**
 * Log API call with performance metrics
 * @param {string} service - Service name (apify, supabase)
 * @param {string} operation - Operation name
 * @param {number} durationMs - Duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
function logApiCall(service, operation, durationMs, metadata = {}) {
  logger.info(`${service} API call`, {
    type: 'api_call',
    service,
    operation,
    duration_ms: durationMs,
    ...metadata
  });
}

/**
 * Log error with context
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
function logError(message, error, context = {}) {
  logger.error(message, {
    type: 'error',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    ...context
  });
}

/**
 * Log warning with context
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 */
function logWarning(message, context = {}) {
  logger.warn(message, {
    type: 'warning',
    ...context
  });
}

/**
 * Log info with context
 * @param {string} message - Info message
 * @param {Object} context - Additional context
 */
function logInfo(message, context = {}) {
  logger.info(message, {
    type: 'info',
    ...context
  });
}

/**
 * Log debug information
 * @param {string} message - Debug message
 * @param {Object} context - Additional context
 */
function logDebug(message, context = {}) {
  logger.debug(message, {
    type: 'debug',
    ...context
  });
}

/**
 * Create child logger with additional metadata
 * @param {Object} metadata - Metadata to include in all logs
 * @returns {Object} Child logger
 */
function createChildLogger(metadata) {
  return logger.child(metadata);
}

module.exports = {
  logger,
  logCollectionMetrics,
  logApiCall,
  logError,
  logWarning,
  logInfo,
  logDebug,
  createChildLogger
};

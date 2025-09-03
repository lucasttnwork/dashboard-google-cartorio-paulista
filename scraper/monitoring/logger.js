import winston from 'winston'
import { config } from '../config/config.js'
import fs from 'fs'
import path from 'path'

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file)
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Custom format for console output with emojis and colors
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let emoji = ''
    switch (level.toLowerCase().replace(/\x1b\[[0-9;]*m/g, '')) { // Remove color codes for comparison
      case 'error':
        emoji = '❌'
        break
      case 'warn':
        emoji = '⚠️'
        break
      case 'info':
        emoji = '📋'
        break
      case 'debug':
        emoji = '🔍'
        break
      default:
        emoji = '📝'
    }
    
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : ''
    return `${emoji} ${timestamp} [${level}] ${message} ${metaStr}`
  })
)

// File format (no colors, structured)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: {
    service: 'cartorio-scraper',
    version: '1.0.0'
  },
  transports: [
    // Console output (with colors and emojis)
    new winston.transports.Console({
      format: consoleFormat
    }),
    
    // File output (structured JSON)
    new winston.transports.File({
      filename: config.logging.file,
      format: fileFormat,
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles
    }),
    
    // Error file (only errors)
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat
    })
  ]
})

// Add performance logging helper
logger.time = (label) => {
  const startTime = Date.now()
  return {
    end: () => {
      const duration = Date.now() - startTime
      logger.info(`⏱️ ${label} completed in ${duration}ms`)
      return duration
    }
  }
}

// Add structured logging helpers
logger.scraping = {
  start: (url) => logger.info('🚀 Starting scraping session', { url, timestamp: new Date().toISOString() }),
  complete: (stats) => logger.info('✅ Scraping session completed', stats),
  error: (error, context = {}) => logger.error('❌ Scraping error', { error: error.message, stack: error.stack, ...context }),
  progress: (current, total) => logger.info(`📊 Progress: ${current}/${total} (${Math.round(current/total*100)}%)`)
}

logger.storage = {
  save: (count) => logger.info(`💾 Saved ${count} reviews to database`),
  duplicate: (reviewId) => logger.debug(`⚠️ Duplicate review skipped: ${reviewId}`),
  error: (error, reviewId) => logger.error('❌ Storage error', { error: error.message, reviewId })
}

logger.processing = {
  start: (count) => logger.info(`🔄 Processing ${count} reviews`),
  complete: (stats) => logger.info('✅ Processing completed', stats),
  validation: (reviewId, reason) => logger.debug(`❌ Validation failed for ${reviewId}: ${reason}`)
}

logger.cron = {
  start: () => logger.info('⏰ Cron job started'),
  complete: (duration) => logger.info(`⏰ Cron job completed in ${duration}ms`),
  skip: (reason) => logger.info(`⏰ Cron job skipped: ${reason}`)
}

logger.monitoring = {
  health: (status) => logger.info(`💚 Health check: ${status}`),
  metrics: (metrics) => logger.info('📊 System metrics', metrics),
  alert: (message, level = 'warn') => logger[level](`🚨 ALERT: ${message}`)
}

// Export logger instance
export default logger

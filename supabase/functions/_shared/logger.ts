// Simple logger implementation for Edge Functions
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
}

export function createLogger(context: string): Logger {
  const formatMessage = (level: string, message: string, meta?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString()
    const base = `[${timestamp}] ${level.toUpperCase()} [${context}] ${message}`
    if (meta) {
      return `${base} ${JSON.stringify(meta)}`
    }
    return base
  }

  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      console.log(formatMessage('info', message, meta))
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      console.error(formatMessage('error', message, meta))
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(formatMessage('warn', message, meta))
    },
  }
}

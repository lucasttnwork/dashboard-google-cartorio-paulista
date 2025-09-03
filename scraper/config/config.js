import dotenv from 'dotenv'

dotenv.config()

export const config = {
  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY
  },

  // Google Business Profile configuration
  gbp: {
    locationId: process.env.GBP_LOCATION_ID || 'cartorio-paulista-location',
    accountId: process.env.GBP_ACCOUNT_ID || 'cartorio-paulista',
    searchUrl: process.env.GBP_SEARCH_URL || 'https://www.google.com/maps/place/Cart%C3%B3rio+Paulista',
    maxRetries: 3,
    requestDelay: 2000, // 2 seconds between requests
    timeout: 30000 // 30 seconds timeout
  },

  // Scraper configuration
  scraper: {
    headless: process.env.NODE_ENV === 'production',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    maxConcurrentPages: 1, // Conservative approach
    reviewsPerPage: 10,
    maxReviewsPerRun: 100
  },

  // Cron schedule
  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 */1 * * *', // Every hour
    timezone: 'America/Sao_Paulo'
  },

  // Monitoring configuration
  monitoring: {
    port: process.env.PORT || 3001,
    healthCheckPath: '/health',
    statusPath: '/api/status',
    metricsPath: '/api/metrics'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/scraper.log',
    maxFiles: 5,
    maxSize: '10m'
  },

  // Deduplication configuration
  dedup: {
    algorithm: 'sha256',
    fields: ['reviewer_name', 'comment', 'rating', 'create_time'],
    cacheSize: 10000 // Keep last 10k review hashes in memory
  }
}

// Validate required configuration
export function validateConfig() {
  const required = [
    'supabase.url',
    'supabase.anonKey'
  ]

  const missing = required.filter(key => {
    const value = key.split('.').reduce((obj, k) => obj?.[k], config)
    return !value
  })

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`)
  }

  return true
}

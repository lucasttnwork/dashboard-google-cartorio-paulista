/**
 * Centralized Configuration for Railway Collector
 * All environment variables and settings in one place
 */

require('dotenv').config();

const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Application
  APP_NAME: 'railway-collector',
  APP_VERSION: process.env.npm_package_version || '1.0.0',
  
  // Server
  PORT: parseInt(process.env.PORT || process.env.HEALTHCHECK_PORT || '3000'),
  
  // Apify Configuration
  APIFY_TOKEN: process.env.APIFY_TOKEN,
  APIFY_ACTOR_ID: process.env.APIFY_ACTOR_ID || 'compass/Google-Maps-Reviews-Scraper',
  APIFY_MAX_REVIEWS: parseInt(process.env.APIFY_MAX_REVIEWS || '200'),
  APIFY_LOOKBACK_HOURS: parseInt(process.env.APIFY_LOOKBACK_HOURS || '24'),
  
  // Google Business Profile URL (from existing scripts)
  GBP_URL: 'https://www.google.com/maps/place/Cartório+Paulista+-+2º+Cartório+de+Notas+de+São+Paulo/@-23.5601417,-46.6595749,17z/data=!3m1!4b1!4m6!3m5!1s0x94ce584607f1763d:0x22957dd9f5b0affb!8m2!3d-23.5601417!4d-46.657!16s%2Fg%2F11clscv01k?entry=ttu&g_ep=EgoyMDI1MDkxNC4wIKXMDSoASAFQAw%3D%3D',
  
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_TABLE_REVIEWS: process.env.SUPABASE_TABLE_REVIEWS || 'reviews',
  SUPABASE_TABLE_REVIEWS_RAW: process.env.SUPABASE_TABLE_REVIEWS_RAW || 'reviews_raw',
  SUPABASE_TABLE_LOCATIONS: process.env.SUPABASE_TABLE_LOCATIONS || 'gbp_locations',
  SUPABASE_TABLE_RUNS: process.env.SUPABASE_TABLE_RUNS || 'collection_runs',
  
  // Scheduling
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '0 6 * * *', // 6h BRT
  TIMEZONE: process.env.TIMEZONE || 'America/Sao_Paulo',
  
  // Business Logic
  LOCATION_ID: process.env.LOCATION_ID || 'cartorio-paulista-location',
  
  // Retry Configuration
  RETRY_ATTEMPTS: parseInt(process.env.RETRY_ATTEMPTS || '3'),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '5000'),
  
  // Monitoring
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  
  // Request Timeouts
  APIFY_TIMEOUT_MS: parseInt(process.env.APIFY_TIMEOUT_MS || '600000'), // 10 minutes
  SUPABASE_TIMEOUT_MS: parseInt(process.env.SUPABASE_TIMEOUT_MS || '30000'), // 30 seconds
};

/**
 * Validate required configuration
 * @throws {Error} If required config is missing
 */
function validateConfig() {
  const required = [
    'APIFY_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate URLs
  if (config.SUPABASE_URL && !isValidUrl(config.SUPABASE_URL)) {
    throw new Error('SUPABASE_URL must be a valid URL');
  }
  
  if (config.WEBHOOK_URL && !isValidUrl(config.WEBHOOK_URL)) {
    throw new Error('WEBHOOK_URL must be a valid URL');
  }
  
  // Validate numeric values
  if (config.APIFY_MAX_REVIEWS <= 0) {
    throw new Error('APIFY_MAX_REVIEWS must be a positive number');
  }
  
  if (config.APIFY_LOOKBACK_HOURS <= 0) {
    throw new Error('APIFY_LOOKBACK_HOURS must be a positive number');
  }
}

/**
 * Check if string is a valid URL
 * @param {string} str - String to validate
 * @returns {boolean} True if valid URL
 */
function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get development mode status
 * @returns {boolean} True if in development mode
 */
function isDevelopment() {
  return config.NODE_ENV === 'development';
}

/**
 * Get production mode status
 * @returns {boolean} True if in production mode
 */
function isProduction() {
  return config.NODE_ENV === 'production';
}

/**
 * Get Apify input configuration
 * @returns {Object} Apify input object
 */
function getApifyInput() {
  return {
    startUrls: [{ url: config.GBP_URL }],
    maxReviews: config.APIFY_MAX_REVIEWS,
    reviewsFromLastHours: config.APIFY_LOOKBACK_HOURS,
    reviewsSort: 'newest',
    language: 'pt-BR',
    includeReviewAnswers: true,
    reviewsOrigin: 'all',
    personalData: true
  };
}

module.exports = {
  ...config,
  validateConfig,
  isDevelopment,
  isProduction,
  getApifyInput
};

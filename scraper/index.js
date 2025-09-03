#!/usr/bin/env node

import { config, validateConfig } from './config/config.js'
import { logger } from './monitoring/logger.js'
import { CronScheduler } from './scheduler/CronScheduler.js'
import { MonitoringDashboard } from './monitoring/MonitoringDashboard.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'

// Get current directory (for ES modules)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class ScraperApp {
  constructor() {
    this.scheduler = null
    this.dashboard = null
    this.isShuttingDown = false
  }

  /**
   * Initialize and start the scraper application
   */
  async start() {
    try {
      logger.info('🚀 Starting Cartório Paulista Review Scraper...')
      
      // Create logs directory if it doesn't exist
      const logsDir = dirname(config.logging.file)
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }

      // Validate configuration
      validateConfig()
      logger.info('✅ Configuration validated')

      // Initialize scheduler
      this.scheduler = new CronScheduler()
      await this.scheduler.start()

      // Initialize monitoring dashboard
      this.dashboard = new MonitoringDashboard(this.scheduler)
      await this.dashboard.start()

      // Setup graceful shutdown
      this.setupGracefulShutdown()

      logger.info('🎉 Scraper application started successfully!')
      logger.info(`📊 Monitoring dashboard: http://localhost:${config.monitoring.port}`)
      logger.info(`⏰ Cron schedule: ${config.cron.schedule}`)
      logger.info('🔄 Ready to scrape reviews!')

      // Log initial health status
      const health = await this.scheduler.getHealth()
      logger.monitoring.health(health.status)

    } catch (error) {
      logger.error('❌ Failed to start scraper application:', error)
      process.exit(1)
    }
  }

  /**
   * Gracefully shutdown the application
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('⚠️ Shutdown already in progress...')
      return
    }

    this.isShuttingDown = true
    logger.info('🛑 Shutting down scraper application...')

    try {
      // Stop scheduler first
      if (this.scheduler) {
        await this.scheduler.stop()
      }

      // Stop monitoring dashboard
      if (this.dashboard) {
        await this.dashboard.stop()
      }

      logger.info('✅ Scraper application shut down gracefully')
      process.exit(0)

    } catch (error) {
      logger.error('❌ Error during shutdown:', error)
      process.exit(1)
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    // Handle SIGTERM (Docker, PM2, etc.)
    process.on('SIGTERM', () => {
      logger.info('📡 Received SIGTERM signal')
      this.shutdown()
    })

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('📡 Received SIGINT signal (Ctrl+C)')
      this.shutdown()
    })

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error)
      this.shutdown()
    })

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Promise Rejection:', { reason, promise })
      this.shutdown()
    })
  }
}

// Handle command line arguments
const args = process.argv.slice(2)
const command = args[0]

async function main() {
  switch (command) {
    case 'start':
    case undefined: // Default command
      const app = new ScraperApp()
      await app.start()
      break

    case 'test':
      logger.info('🧪 Running test scrape...')
      const { GBPScraper } = await import('./gbp/GBPScraper.js')
      const { ReviewProcessor } = await import('./processors/ReviewProcessor.js')
      const { SupabaseStorage } = await import('./storage/SupabaseStorage.js')

      const scraper = new GBPScraper()
      const processor = new ReviewProcessor()
      const storage = new SupabaseStorage()

      try {
        // Test scraping
        const reviews = await scraper.scrapeReviews()
        logger.info(`📊 Test scrape found ${reviews.length} reviews`)

        // Test processing
        const processed = await processor.processReviews(reviews)
        logger.info(`🔄 Processed ${processed.length} reviews`)

        // Test storage connection
        const connected = await storage.testConnection()
        logger.info(`💾 Storage connection: ${connected ? 'OK' : 'FAILED'}`)

        await scraper.cleanup()
        logger.info('✅ Test completed successfully')
      } catch (error) {
        logger.error('❌ Test failed:', error)
        await scraper.cleanup()
        process.exit(1)
      }
      break

    case 'health':
      logger.info('🏥 Checking system health...')
      try {
        const { SupabaseStorage } = await import('./storage/SupabaseStorage.js')
        const storage = new SupabaseStorage()
        
        const connected = await storage.testConnection()
        const stats = await storage.getStorageStats()
        
        console.log('Health Check Results:')
        console.log(`Database Connection: ${connected ? '✅ OK' : '❌ FAILED'}`)
        console.log(`Total Reviews: ${stats.totalReviews}`)
        console.log(`Total Collaborators: ${stats.totalCollaborators}`)
        console.log(`Total Links: ${stats.totalLinks}`)
        
        if (!connected) {
          process.exit(1)
        }
      } catch (error) {
        logger.error('❌ Health check failed:', error)
        process.exit(1)
      }
      break

    case 'config':
      logger.info('⚙️ Configuration:')
      console.log(JSON.stringify({
        supabase: {
          url: config.supabase.url,
          hasServiceKey: !!config.supabase.serviceKey
        },
        gbp: config.gbp,
        scraper: config.scraper,
        cron: config.cron,
        monitoring: config.monitoring
      }, null, 2))
      break

    case 'help':
    case '--help':
    case '-h':
      console.log(`
Cartório Paulista Review Scraper

Usage: node index.js [command]

Commands:
  start     Start the scraper application (default)
  test      Run a test scrape without saving
  health    Check system health and database connection
  config    Show current configuration
  help      Show this help message

Environment Variables:
  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Supabase service role key
  GBP_SEARCH_URL           Google Maps search URL
  CRON_SCHEDULE            Cron schedule (default: every hour)
  PORT                     Monitoring dashboard port (default: 3001)
  LOG_LEVEL                Logging level (default: info)

Examples:
  node index.js start       # Start the application
  node index.js test        # Run test scrape
  node index.js health      # Check system health
      `)
      break

    default:
      logger.error(`❌ Unknown command: ${command}`)
      logger.info('💡 Use "node index.js help" for usage information')
      process.exit(1)
  }
}

// Run the application
main().catch(error => {
  logger.error('💥 Fatal error:', error)
  process.exit(1)
})

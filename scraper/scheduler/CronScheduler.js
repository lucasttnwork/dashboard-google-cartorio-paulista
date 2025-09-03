import cron from 'node-cron'
import { config } from '../config/config.js'
import { logger } from '../monitoring/logger.js'
import { GBPScraper } from '../gbp/GBPScraper.js'
import { ReviewProcessor } from '../processors/ReviewProcessor.js'
import { SupabaseStorage } from '../storage/SupabaseStorage.js'

export class CronScheduler {
  constructor() {
    this.scraper = new GBPScraper()
    this.processor = new ReviewProcessor()
    this.storage = new SupabaseStorage()
    this.isRunning = false
    this.task = null
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastRunDuration: 0,
      lastRunStatus: null,
      nextRun: null
    }
  }

  /**
   * Start the cron scheduler
   */
  async start() {
    try {
      logger.info('🕐 Starting cron scheduler...')
      
      // Validate cron expression
      if (!cron.validate(config.cron.schedule)) {
        throw new Error(`Invalid cron schedule: ${config.cron.schedule}`)
      }

      // Initialize storage connection
      await this.storage.initialize()

      // Create and start cron task
      this.task = cron.schedule(config.cron.schedule, async () => {
        await this.runScrapingJob()
      }, {
        scheduled: false,
        timezone: config.cron.timezone
      })

      this.task.start()
      
      // Calculate next run time
      this.updateNextRunTime()

      logger.info(`✅ Cron scheduler started with schedule: ${config.cron.schedule}`)
      logger.info(`⏰ Next run scheduled for: ${this.stats.nextRun}`)
      
      return true
    } catch (error) {
      logger.error('❌ Failed to start cron scheduler:', error)
      throw error
    }
  }

  /**
   * Stop the cron scheduler
   */
  async stop() {
    try {
      if (this.task) {
        this.task.stop()
        this.task = null
      }

      // Wait for current job to finish if running
      if (this.isRunning) {
        logger.info('⏳ Waiting for current job to finish...')
        while (this.isRunning) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Cleanup resources
      await this.scraper.cleanup()

      logger.info('✅ Cron scheduler stopped')
      return true
    } catch (error) {
      logger.error('❌ Error stopping cron scheduler:', error)
      throw error
    }
  }

  /**
   * Run a single scraping job
   */
  async runScrapingJob() {
    if (this.isRunning) {
      logger.cron.skip('Previous job still running')
      return
    }

    const startTime = Date.now()
    this.isRunning = true
    this.stats.totalRuns++

    try {
      logger.cron.start()
      
      // Step 1: Scrape reviews
      logger.info('📡 Step 1: Scraping reviews from Google Business Profile...')
      const rawReviews = await this.scraper.scrapeReviews()
      
      if (rawReviews.length === 0) {
        logger.info('ℹ️ No new reviews found')
        this.stats.successfulRuns++
        this.stats.lastRunStatus = 'success_no_data'
        return
      }

      // Step 2: Process reviews
      logger.info(`🔄 Step 2: Processing ${rawReviews.length} reviews...`)
      const processedReviews = await this.processor.processReviews(rawReviews)
      
      // Add collaborator mentions analysis
      for (const review of processedReviews) {
        if (review.comment) {
          review.collaboratorMentions = await this.processor.analyzeCollaboratorMentions(review.comment)
        }
      }

      // Step 3: Save to database
      logger.info(`💾 Step 3: Saving ${processedReviews.length} processed reviews...`)
      const saveResults = await this.storage.saveReviews(processedReviews)

      // Update statistics
      const duration = Date.now() - startTime
      this.stats.lastRun = new Date().toISOString()
      this.stats.lastRunDuration = duration
      this.stats.successfulRuns++
      this.stats.lastRunStatus = 'success'

      // Log final results
      logger.cron.complete(duration)
      logger.info('📊 Job Summary:', {
        scraped: rawReviews.length,
        processed: processedReviews.length,
        saved: saveResults.saved,
        duplicates: saveResults.duplicates,
        errors: saveResults.errors,
        duration: `${duration}ms`
      })

    } catch (error) {
      const duration = Date.now() - startTime
      this.stats.failedRuns++
      this.stats.lastRun = new Date().toISOString()
      this.stats.lastRunDuration = duration
      this.stats.lastRunStatus = 'failed'

      logger.error('❌ Scraping job failed:', error)
      
      // Send alert for critical failures
      if (error.message.includes('browser') || error.message.includes('timeout')) {
        logger.monitoring.alert(`Scraping job failed: ${error.message}`, 'error')
      }

    } finally {
      this.isRunning = false
      this.updateNextRunTime()
      
      // Cleanup browser resources
      try {
        await this.scraper.cleanup()
      } catch (cleanupError) {
        logger.error('❌ Error during cleanup:', cleanupError)
      }
    }
  }

  /**
   * Run job manually (outside of schedule)
   */
  async runManual() {
    logger.info('🔧 Running manual scraping job...')
    await this.runScrapingJob()
  }

  /**
   * Update next run time calculation
   */
  updateNextRunTime() {
    if (!this.task) return

    try {
      // This is a simplified calculation - in a real scenario you'd use a proper cron parser
      const now = new Date()
      const nextHour = new Date(now.getTime() + 60 * 60 * 1000) // Add 1 hour
      nextHour.setMinutes(0, 0, 0) // Set to top of hour
      
      this.stats.nextRun = nextHour.toISOString()
    } catch (error) {
      logger.error('❌ Error calculating next run time:', error)
      this.stats.nextRun = null
    }
  }

  /**
   * Get scheduler status and statistics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.task && this.task.running,
      schedule: config.cron.schedule,
      timezone: config.cron.timezone,
      stats: { ...this.stats },
      scraperStats: this.scraper.getStats(),
      processorStats: this.processor.getStats()
    }
  }

  /**
   * Get detailed system health
   */
  async getHealth() {
    try {
      const storageConnected = await this.storage.testConnection()
      const storageStats = await this.storage.getStorageStats()
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        scheduler: {
          isRunning: this.isRunning,
          isScheduled: this.task && this.task.running,
          nextRun: this.stats.nextRun,
          totalRuns: this.stats.totalRuns,
          successRate: this.stats.totalRuns > 0 ? 
            Math.round((this.stats.successfulRuns / this.stats.totalRuns) * 100) : 0
        },
        storage: {
          connected: storageConnected,
          ...storageStats
        },
        scraper: this.scraper.getStats(),
        processor: this.processor.getStats()
      }
    } catch (error) {
      logger.error('❌ Error getting health status:', error)
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      }
    }
  }

  /**
   * Pause the scheduler (stop scheduling but allow manual runs)
   */
  pause() {
    if (this.task) {
      this.task.stop()
      logger.info('⏸️ Cron scheduler paused')
    }
  }

  /**
   * Resume the scheduler
   */
  resume() {
    if (this.task) {
      this.task.start()
      this.updateNextRunTime()
      logger.info('▶️ Cron scheduler resumed')
    }
  }

  /**
   * Update cron schedule (requires restart)
   */
  async updateSchedule(newSchedule) {
    if (!cron.validate(newSchedule)) {
      throw new Error(`Invalid cron schedule: ${newSchedule}`)
    }

    logger.info(`🔄 Updating cron schedule from ${config.cron.schedule} to ${newSchedule}`)
    
    // Stop current task
    if (this.task) {
      this.task.stop()
    }

    // Update config
    config.cron.schedule = newSchedule

    // Create new task
    this.task = cron.schedule(newSchedule, async () => {
      await this.runScrapingJob()
    }, {
      scheduled: true,
      timezone: config.cron.timezone
    })

    this.updateNextRunTime()
    logger.info(`✅ Cron schedule updated. Next run: ${this.stats.nextRun}`)
  }
}

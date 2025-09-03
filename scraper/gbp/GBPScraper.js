import { chromium } from 'playwright'
import { config } from '../config/config.js'
import { logger } from '../monitoring/logger.js'

export class GBPScraper {
  constructor() {
    this.browser = null
    this.page = null
    this.isRunning = false
    this.stats = {
      totalReviews: 0,
      newReviews: 0,
      duplicates: 0,
      errors: 0,
      lastRun: null,
      runDuration: 0
    }
  }

  async initialize() {
    try {
      logger.info('🚀 Initializing GBP Scraper...')
      
      this.browser = await chromium.launch({
        headless: config.scraper.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      })

      this.page = await this.browser.newPage({
        userAgent: config.scraper.userAgent,
        viewport: config.scraper.viewport
      })

      // Set reasonable timeouts
      this.page.setDefaultTimeout(config.gbp.timeout)
      this.page.setDefaultNavigationTimeout(config.gbp.timeout)

      logger.info('✅ GBP Scraper initialized successfully')
      return true
    } catch (error) {
      logger.error('❌ Failed to initialize GBP Scraper:', error)
      await this.cleanup()
      throw error
    }
  }

  async scrapeReviews() {
    if (this.isRunning) {
      logger.warn('⚠️ Scraper is already running, skipping...')
      return []
    }

    const startTime = Date.now()
    this.isRunning = true
    this.stats.errors = 0

    try {
      logger.info('📡 Starting review scraping process...')
      
      if (!this.browser || !this.page) {
        await this.initialize()
      }

      // Navigate to Google Maps location
      logger.info(`🗺️ Navigating to: ${config.gbp.searchUrl}`)
      await this.page.goto(config.gbp.searchUrl, { 
        waitUntil: 'networkidle',
        timeout: config.gbp.timeout 
      })

      // Wait for page to load and find reviews section
      await this.page.waitForTimeout(3000)

      // Look for reviews button/section
      const reviewsSelectors = [
        '[data-value="Reviews"]',
        'button[data-value="Reviews"]',
        '[role="tab"][data-tab-index="1"]',
        'button:has-text("Reviews")',
        'button:has-text("Avaliações")'
      ]

      let reviewsButton = null
      for (const selector of reviewsSelectors) {
        try {
          reviewsButton = await this.page.waitForSelector(selector, { timeout: 5000 })
          if (reviewsButton) {
            logger.info(`✅ Found reviews button with selector: ${selector}`)
            break
          }
        } catch (e) {
          continue
        }
      }

      if (!reviewsButton) {
        throw new Error('Could not find reviews section')
      }

      // Click on reviews tab
      await reviewsButton.click()
      await this.page.waitForTimeout(2000)

      // Scroll to load more reviews
      await this.scrollToLoadReviews()

      // Extract reviews data
      const reviews = await this.extractReviewsData()
      
      this.stats.totalReviews = reviews.length
      this.stats.lastRun = new Date().toISOString()
      this.stats.runDuration = Date.now() - startTime

      logger.info(`✅ Scraping completed. Found ${reviews.length} reviews in ${this.stats.runDuration}ms`)
      return reviews

    } catch (error) {
      this.stats.errors++
      logger.error('❌ Error during scraping:', error)
      throw error
    } finally {
      this.isRunning = false
    }
  }

  async scrollToLoadReviews() {
    logger.info('📜 Scrolling to load more reviews...')
    
    const reviewsContainer = await this.page.waitForSelector('[data-review-id], [jsaction*="review"]', { timeout: 10000 })
    
    if (!reviewsContainer) {
      throw new Error('Could not find reviews container')
    }

    // Scroll multiple times to load more reviews
    const maxScrolls = 5
    let scrollCount = 0
    
    while (scrollCount < maxScrolls) {
      const currentReviewCount = await this.page.locator('[data-review-id]').count()
      
      // Scroll down
      await this.page.evaluate(() => {
        const scrollableElement = document.querySelector('[role="main"]') || document.body
        scrollableElement.scrollBy(0, 1000)
      })
      
      // Wait for potential new content
      await this.page.waitForTimeout(2000)
      
      const newReviewCount = await this.page.locator('[data-review-id]').count()
      
      if (newReviewCount === currentReviewCount) {
        logger.info(`📜 No more reviews to load after ${scrollCount + 1} scrolls`)
        break
      }
      
      scrollCount++
      logger.info(`📜 Scroll ${scrollCount}: Found ${newReviewCount} reviews`)
      
      if (newReviewCount >= config.scraper.maxReviewsPerRun) {
        logger.info(`📜 Reached maximum reviews limit (${config.scraper.maxReviewsPerRun})`)
        break
      }
    }
  }

  async extractReviewsData() {
    logger.info('🔍 Extracting reviews data...')
    
    // Wait for reviews to be present
    await this.page.waitForSelector('[data-review-id], [jsaction*="review"]', { timeout: 10000 })
    
    const reviews = await this.page.evaluate(() => {
      const reviewElements = document.querySelectorAll('[data-review-id], [jsaction*="review"]')
      const extractedReviews = []
      
      reviewElements.forEach((element, index) => {
        try {
          // Extract review data from DOM
          const reviewId = element.getAttribute('data-review-id') || `review_${Date.now()}_${index}`
          
          // Find rating (stars)
          const ratingElement = element.querySelector('[role="img"][aria-label*="star"], [aria-label*="estrela"]')
          let rating = 5 // Default to 5 if can't parse
          
          if (ratingElement) {
            const ariaLabel = ratingElement.getAttribute('aria-label') || ''
            const ratingMatch = ariaLabel.match(/(\d+)/)
            if (ratingMatch) {
              rating = parseInt(ratingMatch[1])
            }
          }
          
          // Find reviewer name
          const nameElement = element.querySelector('[data-attrid="kc:/local:lu attribute list"] button, [data-attrid*="name"] button, button[data-href*="contrib"]')
          const reviewerName = nameElement ? nameElement.textContent.trim() : 'Anonymous'
          
          // Find comment text
          const commentElement = element.querySelector('[data-expandable-section] span, [jsaction*="review.expand"] span, .review-text span')
          const comment = commentElement ? commentElement.textContent.trim() : ''
          
          // Find date - this is tricky as Google uses relative dates
          const dateElement = element.querySelector('[data-sort-order] span, .review-date span, span[title*="ago"], span[title*="atrás"]')
          let createTime = new Date().toISOString() // Default to now
          
          if (dateElement) {
            const dateText = dateElement.textContent.trim()
            // Try to parse relative dates like "2 days ago", "1 week ago", etc.
            createTime = this.parseRelativeDate(dateText)
          }
          
          if (reviewerName && (comment || rating)) {
            extractedReviews.push({
              review_id: reviewId,
              location_id: 'cartorio-paulista-location',
              rating: rating,
              comment: comment,
              reviewer_name: reviewerName,
              is_anonymous: reviewerName === 'Anonymous',
              create_time: createTime,
              update_time: createTime
            })
          }
        } catch (error) {
          console.error('Error extracting review:', error)
        }
      })
      
      return extractedReviews
    })
    
    logger.info(`🔍 Extracted ${reviews.length} reviews from DOM`)
    return reviews
  }

  parseRelativeDate(dateText) {
    const now = new Date()
    const lowerText = dateText.toLowerCase()
    
    // Handle different language patterns
    const patterns = [
      { regex: /(\d+)\s*(day|dia)s?\s*ago|atrás/i, unit: 'days' },
      { regex: /(\d+)\s*(week|semana)s?\s*ago|atrás/i, unit: 'weeks' },
      { regex: /(\d+)\s*(month|mês|mes)s?\s*ago|atrás/i, unit: 'months' },
      { regex: /(\d+)\s*(year|ano)s?\s*ago|atrás/i, unit: 'years' },
      { regex: /(\d+)\s*(hour|hora)s?\s*ago|atrás/i, unit: 'hours' },
      { regex: /(\d+)\s*(minute|minuto)s?\s*ago|atrás/i, unit: 'minutes' }
    ]
    
    for (const pattern of patterns) {
      const match = lowerText.match(pattern.regex)
      if (match) {
        const value = parseInt(match[1])
        const date = new Date(now)
        
        switch (pattern.unit) {
          case 'minutes':
            date.setMinutes(date.getMinutes() - value)
            break
          case 'hours':
            date.setHours(date.getHours() - value)
            break
          case 'days':
            date.setDate(date.getDate() - value)
            break
          case 'weeks':
            date.setDate(date.getDate() - (value * 7))
            break
          case 'months':
            date.setMonth(date.getMonth() - value)
            break
          case 'years':
            date.setFullYear(date.getFullYear() - value)
            break
        }
        
        return date.toISOString()
      }
    }
    
    // If no pattern matches, return current date
    return now.toISOString()
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close()
        this.page = null
      }
      if (this.browser) {
        await this.browser.close()
        this.browser = null
      }
      logger.info('🧹 GBP Scraper cleaned up')
    } catch (error) {
      logger.error('❌ Error during cleanup:', error)
    }
  }

  getStats() {
    return { ...this.stats }
  }

  isScrapingActive() {
    return this.isRunning
  }
}

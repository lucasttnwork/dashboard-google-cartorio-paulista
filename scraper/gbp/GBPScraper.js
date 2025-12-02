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
      
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote'
      ]
      if (process.platform === 'linux') {
        launchArgs.push('--single-process', '--disable-gpu')
      }

      this.browser = await chromium.launch({
        headless: config.scraper.headless,
        args: launchArgs
      })

      const context = await this.browser.newContext({
        userAgent: config.scraper.userAgent,
        viewport: config.scraper.viewport,
        locale: 'pt-BR',
        extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' }
      })
      this.page = await context.newPage()

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

      // Build destination URL (prefer official deep link with place_id)
      const destinationUrl = config.gbp.placeId
        ? `https://www.google.com/maps/search/?api=1&query=Cart%C3%B3rio%20Paulista&query_place_id=${encodeURIComponent(config.gbp.placeId)}&hl=pt-BR&gl=BR`
        : config.gbp.searchUrl

      // Navigate to Google Maps location
      logger.info(`🗺️ Navigating to: ${destinationUrl}`)
      await this.page.goto(destinationUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: config.gbp.timeout 
      })

      // Wait for page to load and find reviews section
      await this.page.waitForTimeout(3000)

      // Handle cookie/consent if present
      await this.handleConsentIfPresent()

      // Open reviews section
      const opened = await this.openReviewsSection()
      if (!opened) {
        logger.warn('⚠️ Could not find reviews section, attempting best-effort extraction from current view')
      }

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

  async handleConsentIfPresent() {
    try {
      const consentSelectors = [
        'button:has-text("Rejeitar tudo")',
        'button:has-text("Aceitar tudo")',
        'button:has-text("Reject all")',
        'button:has-text("Accept all")',
        '[aria-label*="Rejeitar"]',
        '[aria-label*="Aceitar"]'
      ]
      for (const sel of consentSelectors) {
        const btn = await this.page.locator(sel).first()
        if (await btn.isVisible()) {
          await btn.click({ trial: false })
          await this.page.waitForTimeout(500)
          break
        }
      }
    } catch {
      // ignore consent failures
    }
  }

  async openReviewsSection() {
    try {
      // Preferred: direct "lrd" link on the page
      const lrdLink = this.page.locator('a[href*="lrd"]')
      if (await lrdLink.first().count()) {
        const href = await lrdLink.first().getAttribute('href')
        if (href) {
          await this.page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await this.page.waitForTimeout(1200)
          const hasList = await this.page.locator('[data-review-id], [role="list"], [aria-label*="Avaliações" i]').first().count()
          if (hasList) {
            logger.info('✅ Opened reviews via lrd link navigation')
            return true
          }
        } else {
          await lrdLink.first().click()
          await this.page.waitForLoadState('domcontentloaded', { timeout: 20000 })
          await this.page.waitForTimeout(1200)
          const hasList = await this.page.locator('[data-review-id], [role="list"], [aria-label*="Avaliações" i]').first().count()
          if (hasList) {
            logger.info('✅ Opened reviews via lrd link click')
            return true
          }
        }
      }

      // Try explicit "more reviews" button
      const moreReviews = this.page.locator('button[jsaction*="pane.rating.moreReviews"], button[jsaction*="pane.reviewChart.moreReviews"]').first()
      if (await moreReviews.count()) {
        await moreReviews.click()
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 })
        await this.page.waitForTimeout(1200)
        const hasList = await this.page.locator('[data-review-id], [role="list"], [aria-label*="Avaliações" i]').first().count()
        if (hasList) {
          logger.info('✅ Opened reviews via moreReviews button')
          return true
        }
      }

      // Buttons/links by accessible role and name
      const roleTargets = [
        () => this.page.getByRole('button', { name: /Avalia(ç|c)ões/i }).first(),
        () => this.page.getByRole('link', { name: /Avalia(ç|c)ões/i }).first(),
        () => this.page.getByRole('button', { name: /Reviews/i }).first(),
        () => this.page.getByRole('link', { name: /Reviews/i }).first()
      ]
      for (const getTarget of roleTargets) {
        const el = getTarget()
        if (await el.count()) {
          if (await el.isVisible()) {
            await el.click()
            await this.page.waitForTimeout(1200)
            const hasList = await this.page.locator('[data-review-id], [role="list"], [aria-label*="Avaliações" i]').first().count()
            if (hasList) {
              logger.info('✅ Opened reviews via role-based locator')
              return true
            }
          }
        }
      }

      // As fallback, try to navigate to an lrd link present in the page
      const href = await this.page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a')).find(x => x.href && x.href.includes('lrd'))
        return a ? a.href : null
      })
      if (href) {
        await this.page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await this.page.waitForTimeout(1500)
        const hasList = await this.page.locator('[data-review-id], [jsaction*="review"]').first().count()
        if (hasList) {
          logger.info('✅ Opened reviews via lrd link navigation')
          return true
        }
      }

      // If still not present, maybe the list is already visible on the main pane
      const hasDirect = await this.page.locator('[data-review-id], [role="list"], [aria-label*="Avaliações" i]').first().count()
      if (hasDirect) {
        logger.info('ℹ️ Reviews list already visible')
        return true
      }

      // Final fallback: perform a search and open first result
      const searchInput = this.page.locator('input#searchboxinput')
      const searchButton = this.page.locator('button#searchbox-searchbutton')
      if (await searchInput.count()) {
        await searchInput.fill('Cartório Paulista')
        if (await searchButton.count()) {
          await searchButton.click()
        } else {
          await this.page.keyboard.press('Enter')
        }
        await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 })
        await this.page.waitForTimeout(1500)
        // Click first result on left panel
        const firstResult = this.page.locator('[role="article"], .Nv2PK, .hfpxzc').first()
        if (await firstResult.count()) {
          await firstResult.click()
          await this.page.waitForTimeout(1500)
          const openOk = await this.openReviewsSection() // recursive try now that place is open
          if (openOk) return true
        }
      }

      return false
    } catch (e) {
      logger.error('❌ Error opening reviews section:', e)
      return false
    }
  }

  async scrollToLoadReviews() {
    logger.info('📜 Scrolling to load more reviews...')
    
    const reviewSelectors = [
      '[data-review-id]',
      '[jsaction*="review"]',
      '[role="list"]',
      '[role="feed"]',
      'div[aria-label*="Avaliações" i]'
    ].join(', ')

    const reviewsContainer = await this.page.waitForSelector(reviewSelectors, { timeout: 20000 })
    
    if (!reviewsContainer) {
      throw new Error('Could not find reviews container')
    }

    // Force sort by Most Recent before starting
    try {
      await this.trySortByMostRecent()
      await this.page.waitForTimeout(800)
    } catch {}

    // Scroll multiple times to load more reviews (aggressive)
    const maxScrolls = 300
    let scrollCount = 0
    let stableCycles = 0
    
    while (scrollCount < maxScrolls) {
      const currentReviewCount = await this.page.locator('[data-review-id], [role="listitem"], .jftiEf').count()
      
      // Scroll down (target Google Maps reviews list container if present)
      await this.page.evaluate(() => {
        const container = document.querySelector('div[aria-label*="Avaliações" i] .m6QErb.DxyBCb')
          || document.querySelector('div[aria-label*="Avaliações" i]')
          || document.querySelector('[role="list"]')
          || document.querySelector('[role="feed"]')
          || document.querySelector('[aria-label*="reviews" i]')
          || document.querySelector('[role="main"]')
          || document.scrollingElement

        if (container && typeof container.scrollBy === 'function') {
          container.scrollBy(0, 2500)
        } else if (container) {
          container.scrollTop = (container.scrollTop || 0) + 2500
        } else {
          window.scrollBy(0, 2500)
        }
      })
      
      // Wait for potential new content
      await this.page.waitForTimeout(1000)
      
      const newReviewCount = await this.page.locator('[data-review-id], [role="listitem"], .jftiEf').count()
      
      if (newReviewCount === currentReviewCount) {
        stableCycles++
        // periodically re-apply sorting and give more chances to load
        if (stableCycles % 3 === 0) {
          await this.trySortByMostRecent()
          await this.page.waitForTimeout(800)
        }
        if (stableCycles >= 9) {
          logger.info(`📜 No more reviews to load after ${scrollCount + 1} scrolls`)
          break
        }
      }
      
      scrollCount++
      logger.info(`📜 Scroll ${scrollCount}: Found ${newReviewCount} reviews`)
      
      if (newReviewCount >= config.scraper.maxReviewsPerRun) {
        logger.info(`📜 Reached maximum reviews limit (${config.scraper.maxReviewsPerRun})`)
        break
      }
    }
  }

  async trySortByMostRecent() {
    try {
      // Open sort menu
      const sortButton = this.page.getByRole('button', { name: /Ordenar|Sort/i }).first()
      if (await sortButton.count()) {
        await sortButton.click()
        await this.page.waitForTimeout(300)
        const mostRecent = this.page.getByRole('menuitem', { name: /Mais recentes|Most recent/i }).first()
        if (await mostRecent.count()) {
          await mostRecent.click()
          await this.page.waitForTimeout(800)
          return true
        }
      }
    } catch {
      // ignore
    }
    return false
  }

  async extractReviewsData() {
    logger.info('🔍 Extracting reviews data...')
    
    // Wait for reviews to be present
    // Try to wait for presence of any likely review item but don't fail hard
    try {
      await this.page.waitForSelector('[data-review-id], [jsaction*="review"], [role="listitem"], .jftiEf', { timeout: 20000 })
    } catch (_) {
      // proceed with best-effort extraction
    }
    
    const reviews = await this.page.evaluate(() => {
      const reviewElements = document.querySelectorAll('[data-review-id], [jsaction*="review"], [role="listitem"], .jftiEf')
      const extractedReviews = []
      
      reviewElements.forEach((element, index) => {
        try {
          // Extract review data from DOM
          const reviewId = element.getAttribute('data-review-id') || `review_${Date.now()}_${index}`
          
          // Find rating (stars)
          const ratingElement = element.querySelector('[role="img"][aria-label*="star" i], [aria-label*="estrela" i]')
          let rating = 5 // Default to 5 if can't parse
          
          if (ratingElement) {
            const ariaLabel = ratingElement.getAttribute('aria-label') || ''
            const ratingMatch = ariaLabel.match(/(\d+)/)
            if (ratingMatch) {
              rating = parseInt(ratingMatch[1])
            }
          }
          
          // Find reviewer name
          const nameElement = element.querySelector('[data-attrid="kc:/local:lu attribute list"] button, [data-attrid*="name"] button, button[data-href*="contrib"], .d4r55, .TSUbDb, [data-reviewer-name]')
          const reviewerName = nameElement ? nameElement.textContent.trim() : 'Anonymous'
          
          // Find comment text
          const commentElement = element.querySelector('[data-expandable-section] span, [jsaction*="review.expand"] span, .review-text span, .wiI7pd, [data-review-text]')
          const comment = commentElement ? commentElement.textContent.trim() : ''
          
          // Find date text (relative like "2 days ago")
          const dateElement = element.querySelector('[data-sort-order] span, .review-date span, span[title*="ago" i], span[title*="atrás" i], .rsqaWe, .Pua0mf')
          const dateText = dateElement ? dateElement.textContent.trim() : ''
          
          if (reviewerName && (comment || rating)) {
            extractedReviews.push({
              review_id: reviewId,
              location_id: 'cartorio-paulista-location',
              rating: rating,
              comment: comment,
              reviewer_name: reviewerName,
              is_anonymous: reviewerName === 'Anonymous',
              // parse will be done in Node context to avoid scope issues
              date_text: dateText
            })
          }
        } catch (error) {
          console.error('Error extracting review:', error)
        }
      })
      
      return extractedReviews
    })
    
    // Post-process dates on Node side to avoid using "this" inside page context
    const normalized = reviews.map((r) => {
      const createTime = this.parseRelativeDate(r.date_text || '')
      return {
        ...r,
        create_time: createTime,
        update_time: createTime
      }
    })
    
    logger.info(`🔍 Extracted ${normalized.length} reviews from DOM`)
    return normalized
  }

  async scrapeUntilDate(thresholdIso, options = {}) {
    const maxScrolls = options.maxScrolls ?? 1200
    const extractEvery = options.extractEvery ?? 10

    if (this.isRunning) {
      logger.warn('⚠️ Scraper is already running, skipping...')
      return []
    }

    const startTime = Date.now()
    this.isRunning = true
    const collectedById = new Map()
    let minDate = null

    try {
      if (!this.browser || !this.page) {
        await this.initialize()
      }

      const destinationUrl = config.gbp.placeId
        ? `https://www.google.com/maps/search/?api=1&query=Cart%C3%B3rio%20Paulista&query_place_id=${encodeURIComponent(config.gbp.placeId)}&hl=pt-BR&gl=BR`
        : config.gbp.searchUrl

      logger.info(`🗺️ Navigating to: ${destinationUrl}`)
      await this.page.goto(destinationUrl, { waitUntil: 'domcontentloaded', timeout: config.gbp.timeout })
      await this.page.waitForTimeout(2000)
      await this.handleConsentIfPresent()

      const opened = await this.openReviewsSection()
      if (!opened) logger.warn('⚠️ Could not explicitly open reviews, proceeding with best-effort')

      await this.trySortByMostRecent()
      await this.page.waitForTimeout(800)

      const reviewSelectors = '[data-review-id], [role="listitem"], .jftiEf'

      let scrolls = 0
      let stableCycles = 0
      let lastCount = await this.page.locator(reviewSelectors).count()

      while (scrolls < maxScrolls) {
        await this.page.evaluate(() => {
          const container = document.querySelector('div[aria-label*="Avaliações" i] .m6QErb.DxyBCb')
            || document.querySelector('div[aria-label*="Avaliações" i]')
            || document.querySelector('[role="list"]')
            || document.querySelector('[role="feed"]')
            || document.querySelector('[aria-label*="reviews" i]')
            || document.querySelector('[role="main"]')
            || document.scrollingElement
          if (container && typeof container.scrollBy === 'function') container.scrollBy(0, 3500)
          else if (container) container.scrollTop = (container.scrollTop || 0) + 3500
          else window.scrollBy(0, 3000)
        })
        await this.page.waitForTimeout(700)

        const countNow = await this.page.locator(reviewSelectors).count()
        if (countNow === lastCount) {
          stableCycles++
          if (stableCycles % 2 === 0) {
            await this.trySortByMostRecent()
            await this.page.waitForTimeout(500)
          }
          // não quebra por estabilidade; segue até threshold ou maxScrolls
        } else {
          stableCycles = 0
          lastCount = countNow
        }

        scrolls++
        if (scrolls % extractEvery === 0) {
          const chunk = await this.extractReviewsData()
          for (const r of chunk) collectedById.set(r.review_id, r)
          // track minimum date
          for (const r of chunk) {
            const t = r.create_time ? new Date(r.create_time) : null
            if (t && (!minDate || t < minDate)) minDate = t
          }
          if (minDate && minDate <= new Date(thresholdIso)) {
            logger.info(`🛑 Threshold reached at ${minDate.toISOString()} after ${scrolls} scrolls`)
            break
          }
        }
      }

      // Ensure one last extraction
      const finalChunk = await this.extractReviewsData()
      for (const r of finalChunk) collectedById.set(r.review_id, r)

      const all = Array.from(collectedById.values())
      logger.info(`✅ Deep scrape completed. Collected ${all.length} reviews in ${Date.now() - startTime}ms`)
      return all
    } catch (error) {
      this.stats.errors++
      logger.error('❌ Error during deep scraping:', error)
      throw error
    } finally {
      this.isRunning = false
    }
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

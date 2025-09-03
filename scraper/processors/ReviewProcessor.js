import crypto from 'crypto'
import { config } from '../config/config.js'
import { logger } from '../monitoring/logger.js'

export class ReviewProcessor {
  constructor() {
    this.dedupCache = new Map()
    this.stats = {
      processed: 0,
      duplicates: 0,
      invalid: 0,
      collaboratorMatches: 0
    }
  }

  /**
   * Process and validate a batch of reviews
   * @param {Array} reviews - Raw reviews from scraper
   * @returns {Array} Processed and validated reviews
   */
  async processReviews(reviews) {
    logger.info(`🔄 Processing ${reviews.length} reviews...`)
    
    const processedReviews = []
    this.stats.processed = 0
    this.stats.duplicates = 0
    this.stats.invalid = 0
    this.stats.collaboratorMatches = 0

    for (const review of reviews) {
      try {
        // Validate review structure
        if (!this.validateReview(review)) {
          this.stats.invalid++
          continue
        }

        // Check for duplicates
        const reviewHash = this.generateReviewHash(review)
        if (this.isDuplicate(reviewHash)) {
          this.stats.duplicates++
          logger.debug(`⚠️ Duplicate review detected: ${review.review_id}`)
          continue
        }

        // Process and clean review data
        const processedReview = await this.cleanAndEnhanceReview(review)
        
        // Add to dedup cache
        this.addToCache(reviewHash, review.review_id)
        
        processedReviews.push(processedReview)
        this.stats.processed++

      } catch (error) {
        logger.error(`❌ Error processing review ${review.review_id}:`, error)
        this.stats.invalid++
      }
    }

    logger.info(`✅ Processing complete: ${this.stats.processed} processed, ${this.stats.duplicates} duplicates, ${this.stats.invalid} invalid`)
    return processedReviews
  }

  /**
   * Validate review structure and required fields
   * @param {Object} review - Review object to validate
   * @returns {boolean} Is valid
   */
  validateReview(review) {
    const required = ['review_id', 'rating', 'reviewer_name']
    
    for (const field of required) {
      if (!review[field]) {
        logger.debug(`❌ Invalid review: missing ${field}`)
        return false
      }
    }

    // Validate rating range
    if (review.rating < 1 || review.rating > 5) {
      logger.debug(`❌ Invalid review: rating ${review.rating} out of range`)
      return false
    }

    // Validate reviewer name
    if (review.reviewer_name.length < 2) {
      logger.debug(`❌ Invalid review: reviewer name too short`)
      return false
    }

    return true
  }

  /**
   * Generate unique hash for review deduplication
   * @param {Object} review - Review object
   * @returns {string} SHA256 hash
   */
  generateReviewHash(review) {
    const hashFields = config.dedup.fields.map(field => 
      String(review[field] || '')
    ).join('|')
    
    return crypto
      .createHash(config.dedup.algorithm)
      .update(hashFields)
      .digest('hex')
  }

  /**
   * Check if review is duplicate based on hash
   * @param {string} hash - Review hash
   * @returns {boolean} Is duplicate
   */
  isDuplicate(hash) {
    return this.dedupCache.has(hash)
  }

  /**
   * Add review hash to cache
   * @param {string} hash - Review hash
   * @param {string} reviewId - Review ID
   */
  addToCache(hash, reviewId) {
    // Maintain cache size limit
    if (this.dedupCache.size >= config.dedup.cacheSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.dedupCache.keys().next().value
      this.dedupCache.delete(firstKey)
    }
    
    this.dedupCache.set(hash, reviewId)
  }

  /**
   * Clean and enhance review data
   * @param {Object} review - Raw review object
   * @returns {Object} Cleaned and enhanced review
   */
  async cleanAndEnhanceReview(review) {
    const cleaned = { ...review }

    // Clean and normalize text fields
    if (cleaned.comment) {
      cleaned.comment = this.cleanText(cleaned.comment)
    }

    if (cleaned.reviewer_name) {
      cleaned.reviewer_name = this.cleanText(cleaned.reviewer_name)
    }

    // Ensure proper date format
    if (cleaned.create_time) {
      cleaned.create_time = this.normalizeDate(cleaned.create_time)
    }

    if (cleaned.update_time) {
      cleaned.update_time = this.normalizeDate(cleaned.update_time)
    }

    // Set default location_id if not present
    if (!cleaned.location_id) {
      cleaned.location_id = config.gbp.locationId
    }

    // Add processing timestamp
    cleaned.processed_at = new Date().toISOString()

    return cleaned
  }

  /**
   * Clean and normalize text content
   * @param {string} text - Text to clean
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (!text || typeof text !== 'string') return ''

    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\u00C0-\u017F.,!?()-]/g, '') // Keep only letters, numbers, accented chars, and basic punctuation
      .substring(0, 2000) // Limit length
  }

  /**
   * Normalize date to ISO string
   * @param {string|Date} date - Date to normalize
   * @returns {string} ISO date string
   */
  normalizeDate(date) {
    try {
      if (date instanceof Date) {
        return date.toISOString()
      }
      
      if (typeof date === 'string') {
        return new Date(date).toISOString()
      }
      
      return new Date().toISOString()
    } catch (error) {
      logger.warn(`⚠️ Invalid date format: ${date}`)
      return new Date().toISOString()
    }
  }

  /**
   * Analyze review text for collaborator mentions
   * @param {string} comment - Review comment text
   * @returns {Array} Array of potential collaborator matches
   */
  async analyzeCollaboratorMentions(comment) {
    if (!comment || comment.length < 10) return []

    const collaboratorPatterns = [
      // Common Portuguese names that might be collaborators
      /\b(Ana\s+Sophia?|Ana\s+Sofia)\b/gi,
      /\b(Karen\s+Figueiredo)\b/gi,
      /\b(Kaio\s+Gomes|Caio\s+Gomes)\b/gi,
      /\b(Let[ií]cia\s+Andreza)\b/gi,
      /\b(Fabiana\s+Medeiros)\b/gi,
      /\b(Jo[ãa]o\s+Santos)\b/gi,
      /\b(Maria\s+Silva)\b/gi,
      /\b(Pedro\s+Costa)\b/gi,
      /\b(Carla\s+Oliveira)\b/gi,
      
      // Generic patterns for potential names
      /\b([A-Z][a-záàâãéèêíìîóòôõúùû]+\s+[A-Z][a-záàâãéèêíìîóòôõúùû]+)\b/g
    ]

    const mentions = []
    
    for (const pattern of collaboratorPatterns) {
      const matches = comment.match(pattern)
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.trim()
          if (cleanMatch.length > 3) {
            mentions.push({
              name: cleanMatch,
              snippet: this.extractSnippet(comment, match),
              confidence: this.calculateMatchConfidence(match, comment)
            })
          }
        })
      }
    }

    if (mentions.length > 0) {
      this.stats.collaboratorMatches++
    }

    return mentions
  }

  /**
   * Extract snippet around a mention for context
   * @param {string} text - Full text
   * @param {string} mention - Mention to find
   * @returns {string} Context snippet
   */
  extractSnippet(text, mention) {
    const index = text.toLowerCase().indexOf(mention.toLowerCase())
    if (index === -1) return mention

    const start = Math.max(0, index - 30)
    const end = Math.min(text.length, index + mention.length + 30)
    
    return text.substring(start, end).trim()
  }

  /**
   * Calculate confidence score for collaborator mention
   * @param {string} mention - Collaborator mention
   * @param {string} context - Full comment context
   * @returns {number} Confidence score (0-1)
   */
  calculateMatchConfidence(mention, context) {
    let confidence = 0.5 // Base confidence

    // Boost confidence for known names
    const knownNames = ['Ana Sophia', 'Karen Figueiredo', 'Kaio Gomes', 'Letícia Andreza', 'Fabiana Medeiros']
    if (knownNames.some(name => mention.toLowerCase().includes(name.toLowerCase()))) {
      confidence += 0.3
    }

    // Boost confidence if mentioned with positive context
    const positiveWords = ['excelente', 'ótimo', 'muito bom', 'profissional', 'atencioso', 'eficiente', 'competente']
    if (positiveWords.some(word => context.toLowerCase().includes(word))) {
      confidence += 0.2
    }

    // Reduce confidence for very short mentions
    if (mention.length < 6) {
      confidence -= 0.1
    }

    return Math.min(1, Math.max(0, confidence))
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing stats
   */
  getStats() {
    return { ...this.stats }
  }

  /**
   * Clear deduplication cache
   */
  clearCache() {
    this.dedupCache.clear()
    logger.info('🧹 Deduplication cache cleared')
  }

  /**
   * Get cache size
   * @returns {number} Cache size
   */
  getCacheSize() {
    return this.dedupCache.size
  }
}

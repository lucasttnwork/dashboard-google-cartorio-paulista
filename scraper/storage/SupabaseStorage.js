import { createClient } from '@supabase/supabase-js'
import { config } from '../config/config.js'
import { logger } from '../monitoring/logger.js'

export class SupabaseStorage {
  constructor() {
    this.client = null
    this.stats = {
      saved: 0,
      errors: 0,
      duplicates: 0,
      collaboratorLinks: 0
    }
  }

  /**
   * Initialize Supabase client
   */
  async initialize() {
    try {
      if (!config.supabase.url || !config.supabase.serviceKey) {
        throw new Error(`Missing Supabase configuration: URL=${!!config.supabase.url}, KEY=${!!config.supabase.serviceKey}`)
      }

      this.client = createClient(
        config.supabase.url,
        config.supabase.serviceKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )

      // Test connection
      const { data, error } = await this.client
        .from('reviews')
        .select('*', { count: 'exact', head: true })

      if (error) {
        throw error
      }

      logger.info('✅ Supabase storage initialized successfully')
      return true
    } catch (error) {
      logger.error('❌ Failed to initialize Supabase storage:', error)
      throw error
    }
  }

  /**
   * Save processed reviews to Supabase
   * @param {Array} reviews - Processed reviews to save
   * @returns {Object} Save results
   */
  async saveReviews(reviews) {
    if (!this.client) {
      await this.initialize()
    }

    logger.info(`💾 Saving ${reviews.length} reviews to Supabase...`)
    
    this.stats.saved = 0
    this.stats.errors = 0
    this.stats.duplicates = 0
    this.stats.collaboratorLinks = 0

    const results = {
      saved: 0,
      errors: 0,
      duplicates: 0,
      details: []
    }

    for (const review of reviews) {
      try {
        const result = await this.saveReview(review)
        
        if (result.success) {
          results.saved++
          this.stats.saved++
          
          // Process collaborator mentions if any
          if (review.collaboratorMentions) {
            await this.saveCollaboratorMentions(review.review_id, review.collaboratorMentions)
          }
        } else {
          if (result.isDuplicate) {
            results.duplicates++
            this.stats.duplicates++
          } else {
            results.errors++
            this.stats.errors++
          }
        }

        results.details.push(result)
        
      } catch (error) {
        logger.error(`❌ Error saving review ${review.review_id}:`, error)
        results.errors++
        this.stats.errors++
        
        results.details.push({
          review_id: review.review_id,
          success: false,
          error: error.message
        })
      }
    }

    logger.info(`✅ Save complete: ${results.saved} saved, ${results.duplicates} duplicates, ${results.errors} errors`)
    return results
  }

  /**
   * Save individual review to database
   * @param {Object} review - Review object to save
   * @returns {Object} Save result
   */
  async saveReview(review) {
    try {
      // First check if review already exists
      const { data: existing, error: checkError } = await this.client
        .from('reviews')
        .select('review_id')
        .eq('review_id', review.review_id)
        .single()

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
        throw checkError
      }

      if (existing) {
        logger.debug(`⚠️ Review ${review.review_id} already exists`)
        return {
          review_id: review.review_id,
          success: false,
          isDuplicate: true,
          message: 'Review already exists'
        }
      }

      // Insert new review
      const { data, error } = await this.client
        .from('reviews')
        .insert([{
          review_id: review.review_id,
          location_id: review.location_id,
          rating: review.rating,
          comment: review.comment || null,
          reviewer_name: review.reviewer_name,
          is_anonymous: review.is_anonymous || false,
          create_time: review.create_time,
          update_time: review.update_time,
          reply_text: review.reply_text || null,
          reply_time: review.reply_time || null
        }])
        .select()

      if (error) {
        throw error
      }

      logger.debug(`✅ Review ${review.review_id} saved successfully`)
      return {
        review_id: review.review_id,
        success: true,
        data: data
      }

    } catch (error) {
      logger.error(`❌ Error saving review ${review.review_id}:`, error)
      return {
        review_id: review.review_id,
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Save collaborator mentions for a review
   * @param {string} reviewId - Review ID
   * @param {Array} mentions - Array of collaborator mentions
   */
  async saveCollaboratorMentions(reviewId, mentions) {
    if (!mentions || mentions.length === 0) return

    try {
      logger.debug(`👥 Processing ${mentions.length} collaborator mentions for review ${reviewId}`)

      for (const mention of mentions) {
        // Find or create collaborator
        const collaboratorId = await this.findOrCreateCollaborator(mention.name)
        
        if (collaboratorId) {
          // Link collaborator to review
          await this.linkCollaboratorToReview(reviewId, collaboratorId, mention)
          this.stats.collaboratorLinks++
        }
      }

    } catch (error) {
      logger.error(`❌ Error saving collaborator mentions for review ${reviewId}:`, error)
    }
  }

  /**
   * Find existing collaborator or create new one
   * @param {string} name - Collaborator name
   * @returns {number|null} Collaborator ID
   */
  async findOrCreateCollaborator(name) {
    try {
      // First try to find existing collaborator
      const { data: existing, error: findError } = await this.client
        .from('collaborators')
        .select('id')
        .ilike('full_name', name)
        .single()

      if (existing) {
        return existing.id
      }

      if (findError && findError.code !== 'PGRST116') { // Not found is OK
        throw findError
      }

      // Create new collaborator
      const { data: newCollaborator, error: createError } = await this.client
        .from('collaborators')
        .insert([{
          full_name: name,
          department: 'E-notariado', // Default department
          is_active: true,
          aliases: [name]
        }])
        .select('id')
        .single()

      if (createError) {
        throw createError
      }

      logger.debug(`👤 Created new collaborator: ${name} (ID: ${newCollaborator.id})`)
      return newCollaborator.id

    } catch (error) {
      logger.error(`❌ Error finding/creating collaborator ${name}:`, error)
      return null
    }
  }

  /**
   * Link collaborator to review
   * @param {string} reviewId - Review ID
   * @param {number} collaboratorId - Collaborator ID
   * @param {Object} mention - Mention details
   */
  async linkCollaboratorToReview(reviewId, collaboratorId, mention) {
    try {
      // Check if link already exists
      const { data: existing, error: checkError } = await this.client
        .from('review_collaborators')
        .select('review_id')
        .eq('review_id', reviewId)
        .eq('collaborator_id', collaboratorId)
        .single()

      if (existing) {
        logger.debug(`⚠️ Collaborator link already exists: ${reviewId} -> ${collaboratorId}`)
        return
      }

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError
      }

      // Create new link
      const { error: linkError } = await this.client
        .from('review_collaborators')
        .insert([{
          review_id: reviewId,
          collaborator_id: collaboratorId,
          mention_snippet: mention.snippet || null,
          match_score: mention.confidence || 0.5
        }])

      if (linkError) {
        throw linkError
      }

      logger.debug(`🔗 Linked collaborator ${collaboratorId} to review ${reviewId}`)

    } catch (error) {
      logger.error(`❌ Error linking collaborator to review:`, error)
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage stats
   */
  async getStorageStats() {
    try {
      if (!this.client) {
        await this.initialize()
      }

      const [reviewsResult, collaboratorsResult, linksResult] = await Promise.all([
        this.client.from('reviews').select('*', { count: 'exact', head: true }),
        this.client.from('collaborators').select('*', { count: 'exact', head: true }),
        this.client.from('review_collaborators').select('*', { count: 'exact', head: true })
      ])

      return {
        totalReviews: reviewsResult.count || 0,
        totalCollaborators: collaboratorsResult.count || 0,
        totalLinks: linksResult.count || 0,
        sessionStats: { ...this.stats }
      }
    } catch (error) {
      logger.error('❌ Error getting storage stats:', error)
      return {
        totalReviews: 0,
        totalCollaborators: 0,
        totalLinks: 0,
        sessionStats: { ...this.stats },
        error: error.message
      }
    }
  }

  /**
   * Test database connection
   * @returns {boolean} Connection status
   */
  async testConnection() {
    try {
      if (!this.client) {
        await this.initialize()
      }

      const { data, error } = await this.client
        .from('reviews')
        .select('*', { count: 'exact', head: true })

      if (error) {
        throw error
      }

      logger.info('✅ Database connection test successful')
      return true
    } catch (error) {
      logger.error('❌ Database connection test failed:', error)
      return false
    }
  }

  /**
   * Get recent reviews from database
   * @param {number} limit - Number of reviews to fetch
   * @returns {Array} Recent reviews
   */
  async getRecentReviews(limit = 10) {
    try {
      if (!this.client) {
        await this.initialize()
      }

      const { data, error } = await this.client
        .from('reviews')
        .select('*')
        .order('create_time', { ascending: false })
        .limit(limit)

      if (error) {
        throw error
      }

      return data || []
    } catch (error) {
      logger.error('❌ Error fetching recent reviews:', error)
      return []
    }
  }
}

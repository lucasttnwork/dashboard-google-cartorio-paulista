import { config } from '../config/config.js'
import { logger } from '../monitoring/logger.js'

export class DataForSEOFallback {
  constructor() {}

  async fetchLatest(nextToken = null) {
    try {
      if (!config.dataforseo?.authB64) return []
      const body = [{
        place_id: config.gbp.placeId || undefined,
        language_name: 'Portuguese',
        sort_by: 'newest',
        depth: 100,
        ...(nextToken ? { next_token: nextToken } : {})
      }]

      const res = await fetch(`${config.dataforseo.baseUrl}/business_data/google/reviews/live/advanced`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${config.dataforseo.authB64}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (!res.ok || data.status_code !== 20000) {
        logger.warn('DataForSEO non-200', { status: data.status_code, message: data.status_message })
        return []
      }

      const items = []
      let next = null
      if (data.tasks && data.tasks[0]?.result) {
        for (const result of data.tasks[0].result) {
          if (Array.isArray(result.items)) items.push(...result.items)
          if (result.next_token) next = result.next_token
        }
      }

      // Map to internal normalized shape expected by processor
      const mapped = items.map(it => ({
        review_id: String(it.review_id || ''),
        location_id: config.gbp.locationId,
        rating: it.rating?.value ?? it.rating ?? 5,
        comment: it.review_text ?? it.text ?? it.comment ?? '',
        reviewer_name: it.reviewer_name ?? it.author ?? 'Anonymous',
        is_anonymous: !(it.reviewer_name || it.author),
        create_time: it.timestamp ?? it.time ?? new Date().toISOString(),
        update_time: it.updated_timestamp ?? null
      }))

      return mapped
    } catch (e) {
      logger.error('DataForSEOFallback error', e)
      return []
    }
  }
}



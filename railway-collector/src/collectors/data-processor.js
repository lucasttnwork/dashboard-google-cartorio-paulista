const { logInfo } = require('../monitoring/logger');
const storage = require('../storage/supabase-client');
const { normalizeApifyReviews } = require('../utils/apify-normalizer');
const config = require('../utils/config');

class DataProcessor {
  async normalize(rawReviews) {
    logInfo('Starting data normalization', { count: rawReviews.length });
    
    const normalized = normalizeApifyReviews(rawReviews, config.LOCATION_ID);
    const valid = normalized.filter(review => this.isValid(review));
    
    logInfo('Normalization completed', { 
      input: rawReviews.length,
      normalized: normalized.length,
      valid: valid.length,
      invalid: normalized.length - valid.length
    });
    
    return valid;
  }
  
  async deduplicate(normalizedReviews) {
    const reviewIds = normalizedReviews.map(r => r.review_id);
    const existing = await storage.getExistingReviews(reviewIds);
    const existingMap = new Map(existing.map(r => [r.review_id, r]));
    
    const newReviews = [];
    const updatedReviews = [];
    
    for (const review of normalizedReviews) {
      const existingReview = existingMap.get(review.review_id);
      
      if (!existingReview) {
        newReviews.push(review);
      } else if (this.hasChanged(review, existingReview)) {
        updatedReviews.push(review);
      }
      // Se não mudou, ignora (não faz nada)
    }
    
    logInfo('Deduplication completed', {
      total: normalizedReviews.length,
      new: newReviews.length,
      updated: updatedReviews.length,
      unchanged: normalizedReviews.length - newReviews.length - updatedReviews.length
    });
    
    return { newReviews, updatedReviews };
  }
  
  isValid(review) {
    return review.review_id && 
           review.rating && 
           review.comment && 
           review.reviewer_name;
  }
  
  hasChanged(current, existing) {
    // Compara campos que podem mudar (response_text, etc.)
    return current.response_text !== existing.response_text ||
           current.comment !== existing.comment ||
           current.rating !== existing.rating;
  }
}

module.exports = DataProcessor;

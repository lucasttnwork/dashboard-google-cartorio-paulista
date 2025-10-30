const { ApifyClient } = require('apify-client');
const { logInfo, logWarning } = require('../monitoring/logger');
const config = require('../utils/config');

class ApifyCollector {
  constructor() {
    this.client = new ApifyClient({ 
      token: config.APIFY_TOKEN 
    });
  }
  
  async fetchReviews(retryCount = 0) {
    try {
      const input = config.getApifyInput();
      
      logInfo('Starting Apify collection', input);
      
      const run = await this.client.actor(config.APIFY_ACTOR_ID).call(input);
      
      if (run.status !== 'SUCCEEDED') {
        throw new Error(`Apify run failed: ${run.status}`);
      }
      
      const { items } = await this.client.dataset(run.defaultDatasetId)
        .listItems({ limit: config.APIFY_MAX_REVIEWS });
      
      logInfo('Apify collection completed', { 
        reviewsFound: items.length,
        runId: run.id 
      });
      
      return items;
      
    } catch (error) {
      if (retryCount < config.RETRY_ATTEMPTS) {
        logWarning('Apify collection failed, retrying', { 
          attempt: retryCount + 1,
          error: error.message 
        });
        
        await this.delay(config.RETRY_DELAY_MS * Math.pow(2, retryCount));
        return this.fetchReviews(retryCount + 1);
      }
      
      throw error;
    }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ApifyCollector;

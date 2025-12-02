/**
 * Supabase Client with Connection Testing and Storage Operations
 * Handles all database operations for the Railway Collector
 */

const { createClient } = require('@supabase/supabase-js');
const { logInfo, logError, logApiCall, logDebug } = require('../monitoring/logger');
const config = require('../utils/config');

class SupabaseStorage {
  constructor() {
    this.client = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        db: {
          schema: 'public'
        }
      }
    );
    
    this.isConnected = false;
  }

  /**
   * Test connectivity to Supabase
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    const startTime = Date.now();
    
    try {
      logInfo('Testing Supabase connection');
      
      // Simple query to test connection
      const { data, error } = await this.client
        .from(config.SUPABASE_TABLE_LOCATIONS)
        .select('location_id')
        .limit(1);

      if (error) {
        throw error;
      }

      const duration = Date.now() - startTime;
      logApiCall('supabase', 'connection_test', duration, { 
        success: true,
        records_found: data?.length || 0 
      });
      
      this.isConnected = true;
      logInfo('Supabase connection successful');
      return true;

    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'connection_test', duration, { success: false });
      logError('Supabase connection failed', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Get existing reviews by review IDs
   * @param {Array<string>} reviewIds - Array of review IDs to check
   * @returns {Promise<Array>} Existing reviews
   */
  async getExistingReviews(reviewIds) {
    if (!reviewIds || reviewIds.length === 0) {
      return [];
    }

    const startTime = Date.now();
    
    try {
      const { data, error } = await this.client
        .from(config.SUPABASE_TABLE_REVIEWS)
        .select('review_id, rating, comment, response_text, last_seen_at')
        .in('review_id', reviewIds);

      if (error) {
        throw error;
      }

      const duration = Date.now() - startTime;
      logApiCall('supabase', 'get_existing_reviews', duration, {
        requested: reviewIds.length,
        found: data?.length || 0
      });

      return data || [];

    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'get_existing_reviews', duration, { success: false });
      logError('Failed to get existing reviews', error);
      throw error;
    }
  }

  /**
   * Validate required schema columns exist
   * @returns {Promise<boolean>} Validation status
   */
  async validateSchema() {
    const startTime = Date.now();
    
    try {
      logInfo('Validating Supabase schema');
      
      const { data: rawExists, error: rawError } = await this.client
        .rpc('check_table_column', {
          p_table_name: 'reviews_raw',
          p_column_name: 'raw_payload'
        });
      
      if (rawError || rawExists !== true) {
        throw new Error('raw_payload column missing in reviews_raw');
      }
      
      const { data: endedExists, error: endedError } = await this.client
        .rpc('check_table_column', {
          p_table_name: 'collection_runs',
          p_column_name: 'ended_at'
        });
      
      if (endedError || endedExists !== true) {
        throw new Error('ended_at column missing in collection_runs');
      }
      
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'validate_schema', duration, { success: true });
      logInfo('Schema validation successful');
      return true;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'validate_schema', duration, { success: false });
      logError('Schema validation failed', error);
      return false;
    }
  }

  /**
   * Persist reviews to database using atomic RPC
   * @param {Array} newReviews - New reviews to insert
   * @param {Array} updatedReviews - Reviews to update
   * @param {string} runId - Collection run ID
   * @returns {Promise<Object>} Result with inserted/updated counts
   */
  async persistReviews(newReviews, updatedReviews, runId) {
    const startTime = Date.now();
    
    try {
      logInfo('Starting atomic review persistence', {
        new_reviews: newReviews.length,
        updated_reviews: updatedReviews.length,
        run_id: runId
      });

      const schemaValid = await this.validateSchema();
      if (!schemaValid) {
        throw new Error('Schema validation failed - required columns missing');
      }

      const { data, error } = await this.client
        .rpc('persist_reviews_atomic', {
          p_new_reviews: newReviews,
          p_updated_reviews: updatedReviews,
          p_location_id: config.LOCATION_ID,
          p_run_id: Number(runId)
        });

      if (error) {
        throw new Error(`RPC failed: ${error.message}`);
      }

      if (data && data.error) {
        throw new Error(`RPC error: ${data.error}`);
      }

      const result = data || { inserted: 0, updated: 0 };
      const duration = Date.now() - startTime;

      logApiCall('supabase', 'persist_reviews_atomic', duration, { 
        ...result,
        run_id: runId 
      });
      logInfo('Atomic review persistence completed', result);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'persist_reviews_atomic', duration, { success: false });
      logError('Failed to persist reviews atomically', error);
      throw error;
    }
  }

  /**
   * Create a new collection run record
   * @param {Object} runData - Initial run data
   * @returns {Promise<string>} Run ID
   */
  async createRun(runData) {
    const startTime = Date.now();

    try {
      const { data, error } = await this.client
        .from(config.SUPABASE_TABLE_RUNS)
        .insert({
          location_id: config.LOCATION_ID,
          started_at: new Date().toISOString(),
          run_type: 'scheduled',
          status: 'running',
          ...runData
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      const duration = Date.now() - startTime;
      logApiCall('supabase', 'create_run', duration, { run_id: data.id });

      return data.id;

    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'create_run', duration, { success: false });
      logError('Failed to create collection run', error);
      throw error;
    }
  }

  /**
   * Finalize a collection run with results
   * @param {string} runId - Run ID
   * @param {Object} runResult - Run result data
   * @returns {Promise<void>}
   */
  async finalizeRun(runId, runResult) {
    const startTime = Date.now();

    try {
      const { error } = await this.client
        .from(config.SUPABASE_TABLE_RUNS)
        .update(runResult) // Remove ended_at, let runResult have it if schema has
        .eq('id', runId);

      if (error) {
        throw error;
      }

      const duration = Date.now() - startTime;
      logApiCall('supabase', 'finalize_run', duration, { run_id: runId });

    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'finalize_run', duration, { success: false });
      logError('Failed to finalize collection run', error);
      throw error;
    }
  }

  /**
   * Update location metrics
   * @returns {Promise<void>}
   */
  async updateLocationMetrics() {
    const startTime = Date.now();

    try {
      logInfo('Updating location metrics');

      const { error } = await this.client.rpc('update_location_metrics', {
        location_id_param: config.LOCATION_ID
      });

      if (error) {
        throw error;
      }

      const duration = Date.now() - startTime;
      logApiCall('supabase', 'update_location_metrics', duration);
      logInfo('Location metrics updated successfully');

    } catch (error) {
      const duration = Date.now() - startTime;
      logApiCall('supabase', 'update_location_metrics', duration, { success: false });
      logError('Failed to update location metrics', error);
      throw error;
    }
  }

  /**
   * Get health status of the database
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const startTime = Date.now();
      
      // Check basic connectivity
      const { data, error } = await this.client
        .from(config.SUPABASE_TABLE_LOCATIONS)
        .select('location_id, total_reviews_count, current_rating')
        .eq('location_id', config.LOCATION_ID)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is OK
        throw error;
      }

      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        response_time_ms: responseTime,
        location_found: !!data,
        total_reviews: data?.total_reviews_count || 0,
        current_rating: data?.current_rating || null
      };

    } catch (error) {
      logError('Database health check failed', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

const storageInstance = new SupabaseStorage();
module.exports = storageInstance;

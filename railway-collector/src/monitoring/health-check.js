/**
 * Health Check System for Railway Monitoring
 * Provides endpoints for health monitoring and system status
 */

const { logInfo, logError } = require("./logger");
const storage = require("../storage/supabase-client");
const config = require("../utils/config");

class HealthCheckSystem {
  constructor() {
    this.storage = storage;
    this.startTime = Date.now();
    this.lastHealthCheck = null;
    this.healthStatus = {
      status: "unknown",
      timestamp: new Date().toISOString(),
      uptime: 0,
      database: null,
      memory: null,
      environment: config.NODE_ENV,
    };
  }

  /**
   * Perform comprehensive health check
   * @returns {Promise<Object>} Health status
   */
  async performHealthCheck() {
    const checkStart = Date.now();

    try {
      logInfo("Performing health check");

      // Check database connectivity
      const dbHealth = await this.storage.getHealthStatus();

      // Get memory usage
      const memoryUsage = process.memoryUsage();

      // Calculate uptime
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      const healthStatus = {
        status: dbHealth.connected ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: uptime,
        database: dbHealth,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        },
        environment: config.NODE_ENV,
        version: config.APP_VERSION,
        service: config.APP_NAME,
        response_time_ms: Date.now() - checkStart,
      };

      this.healthStatus = healthStatus;
      this.lastHealthCheck = Date.now();

      logInfo("Health check completed", {
        status: healthStatus.status,
        response_time: healthStatus.response_time_ms,
      });

      return healthStatus;
    } catch (error) {
      logError("Health check failed", error);

      const errorStatus = {
        status: "error",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        error: error.message,
        environment: config.NODE_ENV,
        version: config.APP_VERSION,
        service: config.APP_NAME,
        response_time_ms: Date.now() - checkStart,
      };

      this.healthStatus = errorStatus;
      return errorStatus;
    }
  }

  /**
   * Get cached health status (fast response)
   * @returns {Object} Cached health status
   */
  getCachedHealth() {
    const cacheAge = this.lastHealthCheck
      ? Date.now() - this.lastHealthCheck
      : null;

    return {
      ...this.healthStatus,
      cache_age_ms: cacheAge,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Express middleware for health endpoint
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async healthEndpoint(req, res) {
    try {
      const health = await this.performHealthCheck();
      const statusCode = health.status === "healthy" ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      logError("Health endpoint error", error);
      res.status(500).json({
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Express middleware for status dashboard
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async statusEndpoint(req, res) {
    try {
      const health = await this.performHealthCheck();

      // Additional status information
      const status = {
        ...health,
        configuration: {
          location_id: config.LOCATION_ID,
          cron_schedule: config.CRON_SCHEDULE,
          timezone: config.TIMEZONE,
          apify_max_reviews: config.APIFY_MAX_REVIEWS,
          log_level: config.LOG_LEVEL,
        },
        system: {
          node_version: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
        },
      };

      res.status(200).json(status);
    } catch (error) {
      logError("Status endpoint error", error);
      res.status(500).json({
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Simple ready check for Railway
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  readyEndpoint(req, res) {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Consider ready if we've been up for at least 5 seconds
    if (uptime >= 5) {
      res.status(200).json({
        ready: true,
        uptime: uptime,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        ready: false,
        uptime: uptime,
        message: "Service starting up...",
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Metrics endpoint for monitoring
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async metricsEndpoint(req, res) {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
        memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        database_connected: this.healthStatus.database?.connected || false,
        last_health_check: this.lastHealthCheck
          ? new Date(this.lastHealthCheck).toISOString()
          : null,
      };

      res.status(200).json(metrics);
    } catch (error) {
      logError("Metrics endpoint error", error);
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

module.exports = HealthCheckSystem;

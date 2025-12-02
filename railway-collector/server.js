/**
 * Railway Collector - Main Server
 * Express server with health endpoints and cron scheduling
 */

const express = require("express");
const cors = require("cors");
const { logInfo, logError, logWarning } = require("./src/monitoring/logger");
const HealthCheckSystem = require("./src/monitoring/health-check");
const config = require("./src/utils/config");
const ApifyCollector = require("./src/collectors/apify-collector");
const DataProcessor = require("./src/collectors/data-processor");
const storage = require("./src/storage/supabase-client");
const { startScheduler } = require("./src/scheduler");

// Validate configuration on startup
try {
  config.validateConfig();
  logInfo("Configuration validated successfully");
} catch (error) {
  logError("Configuration validation failed", error);
  process.exit(1);
}

// Create Express app
const app = express();
const healthSystem = new HealthCheckSystem();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logInfo("HTTP Request", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration_ms: duration,
      user_agent: req.get("User-Agent"),
      ip: req.ip || req.connection.remoteAddress,
    });
  });

  next();
});

// Health and monitoring endpoints
app.get("/health", (req, res) => {
  healthSystem.healthEndpoint(req, res);
});

app.get("/status", (req, res) => {
  healthSystem.statusEndpoint(req, res);
});

app.get("/ready", (req, res) => {
  healthSystem.readyEndpoint(req, res);
});

app.get("/metrics", (req, res) => {
  healthSystem.metricsEndpoint(req, res);
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: config.APP_NAME,
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: [
      "/health - Health check endpoint",
      "/status - Detailed status dashboard",
      "/ready - Readiness probe",
      "/metrics - Basic metrics",
      "/collect - Manual collection trigger (POST)",
    ],
  });
});

// Manual collection trigger endpoint (for testing)
app.post("/collect", async (req, res) => {
  const runContext = {
    source: req.body?.source || "manual_api",
    trigger_payload: req.body || {},
    user_agent: req.get("User-Agent"),
    ip: req.ip || req.connection?.remoteAddress,
  };

  const startTime = Date.now();

  try {
    logInfo("Manual collection triggered", runContext);

    const collector = new ApifyCollector();
    const processor = new DataProcessor();

    const connected = await storage.testConnection();
    if (!connected) {
      throw new Error("Supabase connection failed");
    }

    const runId = await storage.createRun({
      run_type: "manual",
      source: runContext.source,
      metadata: runContext,
    });

    try {
      const rawReviews = await collector.fetchReviews();
      const normalizedReviews = await processor.normalize(rawReviews);
      const { newReviews, updatedReviews } =
        await processor.deduplicate(normalizedReviews);

      const persistResult = await storage.persistReviews(
        newReviews,
        updatedReviews,
        runId,
      );
      await storage.updateLocationMetrics();

      const executionTimeMs = Date.now() - startTime;
      const runResult = {
        status: "completed",
        ended_at: new Date().toISOString(),
        execution_time_ms: executionTimeMs,
        reviews_found: rawReviews.length,
        reviews_new: persistResult.inserted || 0,
        reviews_updated: persistResult.updated || 0,
        metadata: {
          ...runContext,
          normalized: normalizedReviews.length,
          new_reviews: newReviews.length,
          updated_reviews: updatedReviews.length,
        },
      };

      await storage.finalizeRun(runId, runResult);

      logInfo("Manual collection completed", runResult);

      return res.status(200).json({
        message: "Manual collection completed",
        run_id: runId,
        execution_time_ms: executionTimeMs,
        reviews_found: rawReviews.length,
        reviews_new: persistResult.inserted || 0,
        reviews_updated: persistResult.updated || 0,
        normalized_reviews: normalizedReviews.length,
        timestamp: new Date().toISOString(),
      });
    } catch (pipelineError) {
      await storage.finalizeRun(runId, {
        status: "failed",
        ended_at: new Date().toISOString(),
        execution_time_ms: Date.now() - startTime,
        error_message: pipelineError.message,
        metadata: {
          ...runContext,
          error_stack: pipelineError.stack,
        },
      });

      logError("Manual collection pipeline failed", pipelineError, {
        run_id: runId,
      });

      return res.status(500).json({
        error: pipelineError.message,
        run_id: runId,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logError("Manual collection failed", error);
    return res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((error, req, res, next) => {
  logError("Express error handler", error, {
    method: req.method,
    url: req.url,
    user_agent: req.get("User-Agent"),
  });

  res.status(500).json({
    error: "Internal Server Error",
    message: config.isDevelopment() ? error.message : "Something went wrong",
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logInfo(`Received ${signal}, starting graceful shutdown`);

  if (!server) {
    logWarning("Graceful shutdown requested but server not started");
    return process.exit(0);
  }

  server.close(() => {
    logInfo("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logError("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logError("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logError("Unhandled rejection", new Error(reason), {
    promise: promise.toString(),
  });
  process.exit(1);
});

let server = null;

function startServer() {
  if (server) {
    return server;
  }

  server = app.listen(config.PORT, () => {
    logInfo("Railway Collector started", {
      port: config.PORT,
      environment: config.NODE_ENV,
      version: config.APP_VERSION,
      location_id: config.LOCATION_ID,
      cron_schedule: config.CRON_SCHEDULE,
      timezone: config.TIMEZONE,
    });

    healthSystem
      .performHealthCheck()
      .then(() => {
        logInfo("Initial health check completed");
      })
      .catch((error) => {
        logWarning("Initial health check failed", { error: error.message });
      });
  });

  return server;
}

if (config.NODE_ENV !== "test") {
  startServer();

  if (process.env.ENABLE_CRON === "true") {
    startScheduler();
  }
}

module.exports = app;
module.exports.startServer = startServer;
module.exports.getServerInstance = () => server;

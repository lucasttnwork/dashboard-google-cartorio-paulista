import express from 'express'
import { config } from '../config/config.js'
import { logger } from './logger.js'

export class MonitoringDashboard {
  constructor(scheduler) {
    this.app = express()
    this.scheduler = scheduler
    this.server = null
    this.startTime = new Date()
    
    this.setupMiddleware()
    this.setupRoutes()
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // JSON parsing
    this.app.use(express.json())
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      next()
    })

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`📡 ${req.method} ${req.path}`)
      next()
    })
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get(config.monitoring.healthCheckPath, async (req, res) => {
      try {
        const health = await this.scheduler.getHealth()
        const statusCode = health.status === 'healthy' ? 200 : 503
        res.status(statusCode).json(health)
      } catch (error) {
        logger.error('❌ Health check failed:', error)
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        })
      }
    })

    // Status endpoint
    this.app.get(config.monitoring.statusPath, (req, res) => {
      try {
        const status = this.scheduler.getStatus()
        const uptime = Date.now() - this.startTime.getTime()
        
        res.json({
          ...status,
          uptime: {
            ms: uptime,
            human: this.formatUptime(uptime)
          },
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        logger.error('❌ Status check failed:', error)
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Metrics endpoint
    this.app.get(config.monitoring.metricsPath, async (req, res) => {
      try {
        const health = await this.scheduler.getHealth()
        const status = this.scheduler.getStatus()
        const uptime = Date.now() - this.startTime.getTime()

        const metrics = {
          system: {
            uptime_ms: uptime,
            uptime_human: this.formatUptime(uptime),
            memory_usage: process.memoryUsage(),
            cpu_usage: process.cpuUsage()
          },
          scheduler: {
            is_running: status.isRunning,
            is_scheduled: status.isScheduled,
            total_runs: status.stats.totalRuns,
            successful_runs: status.stats.successfulRuns,
            failed_runs: status.stats.failedRuns,
            success_rate: status.stats.totalRuns > 0 ? 
              Math.round((status.stats.successfulRuns / status.stats.totalRuns) * 100) : 0,
            last_run: status.stats.lastRun,
            last_run_duration_ms: status.stats.lastRunDuration,
            next_run: status.stats.nextRun
          },
          storage: health.storage || {},
          scraper: status.scraperStats || {},
          processor: status.processorStats || {}
        }

        res.json(metrics)
      } catch (error) {
        logger.error('❌ Metrics collection failed:', error)
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Manual trigger endpoint
    this.app.post('/api/trigger', async (req, res) => {
      try {
        if (this.scheduler.isRunning) {
          return res.status(409).json({
            error: 'Scraper is already running',
            timestamp: new Date().toISOString()
          })
        }

        logger.info('🔧 Manual trigger requested via API')
        
        // Run job asynchronously
        this.scheduler.runManual().catch(error => {
          logger.error('❌ Manual job failed:', error)
        })

        res.json({
          message: 'Manual scraping job triggered',
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        logger.error('❌ Manual trigger failed:', error)
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Pause/Resume scheduler
    this.app.post('/api/scheduler/:action', (req, res) => {
      try {
        const { action } = req.params
        
        switch (action) {
          case 'pause':
            this.scheduler.pause()
            res.json({ message: 'Scheduler paused', timestamp: new Date().toISOString() })
            break
          case 'resume':
            this.scheduler.resume()
            res.json({ message: 'Scheduler resumed', timestamp: new Date().toISOString() })
            break
          default:
            res.status(400).json({ error: 'Invalid action. Use pause or resume.' })
        }
      } catch (error) {
        logger.error(`❌ Scheduler ${req.params.action} failed:`, error)
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Simple HTML dashboard
    this.app.get('/', (req, res) => {
      res.send(this.generateDashboardHTML())
    })

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
        timestamp: new Date().toISOString()
      })
    })

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('❌ Express error:', error)
      res.status(500).json({
        error: error.message,
        timestamp: new Date().toISOString()
      })
    })
  }

  /**
   * Start the monitoring server
   */
  async start() {
    try {
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(config.monitoring.port, (error) => {
          if (error) {
            reject(error)
          } else {
            logger.info(`🖥️ Monitoring dashboard started on port ${config.monitoring.port}`)
            logger.info(`🔗 Dashboard URL: http://localhost:${config.monitoring.port}`)
            logger.info(`🏥 Health check: http://localhost:${config.monitoring.port}${config.monitoring.healthCheckPath}`)
            resolve(true)
          }
        })
      })
    } catch (error) {
      logger.error('❌ Failed to start monitoring dashboard:', error)
      throw error
    }
  }

  /**
   * Stop the monitoring server
   */
  async stop() {
    try {
      if (this.server) {
        return new Promise((resolve) => {
          this.server.close(() => {
            logger.info('✅ Monitoring dashboard stopped')
            resolve(true)
          })
        })
      }
    } catch (error) {
      logger.error('❌ Error stopping monitoring dashboard:', error)
      throw error
    }
  }

  /**
   * Format uptime in human readable format
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * Generate simple HTML dashboard
   */
  generateDashboardHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Cartório Paulista - Scraper Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-healthy { background: #d4edda; color: #155724; }
        .status-running { background: #cce5ff; color: #004085; }
        .status-stopped { background: #f8d7da; color: #721c24; }
        .metric { margin: 10px 0; }
        .metric-label { font-weight: 600; color: #666; }
        .metric-value { font-size: 24px; font-weight: bold; color: #333; }
        .btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        .btn:hover { background: #0056b3; }
        .btn-danger { background: #dc3545; }
        .btn-danger:hover { background: #c82333; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏛️ Cartório Paulista - Review Scraper Dashboard</h1>
            <p>Automated Google Business Profile review collection system</p>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📊 System Status</h3>
                <div id="system-status">Loading...</div>
                <button class="btn" onclick="refreshStatus()">🔄 Refresh</button>
                <button class="btn" onclick="triggerManual()">▶️ Run Now</button>
            </div>

            <div class="card">
                <h3>⏰ Scheduler</h3>
                <div id="scheduler-info">Loading...</div>
                <button class="btn" onclick="pauseScheduler()">⏸️ Pause</button>
                <button class="btn" onclick="resumeScheduler()">▶️ Resume</button>
            </div>
        </div>

        <div class="card">
            <h3>📈 Metrics</h3>
            <div id="metrics">Loading...</div>
        </div>

        <div class="card">
            <h3>🏥 Health Check</h3>
            <div id="health">Loading...</div>
        </div>
    </div>

    <script>
        async function fetchJSON(url) {
            const response = await fetch(url);
            return response.json();
        }

        async function refreshStatus() {
            try {
                const status = await fetchJSON('/api/status');
                document.getElementById('system-status').innerHTML = \`
                    <div class="metric">
                        <div class="metric-label">Scraper Status</div>
                        <div class="metric-value">
                            <span class="status-badge \${status.isRunning ? 'status-running' : 'status-stopped'}">
                                \${status.isRunning ? '🏃 Running' : '⏹️ Stopped'}
                            </span>
                        </div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Uptime</div>
                        <div class="metric-value">\${status.uptime.human}</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Total Runs</div>
                        <div class="metric-value">\${status.stats.totalRuns}</div>
                    </div>
                \`;

                document.getElementById('scheduler-info').innerHTML = \`
                    <div class="metric">
                        <div class="metric-label">Schedule</div>
                        <div class="metric-value">\${status.schedule}</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Next Run</div>
                        <div class="metric-value">\${status.stats.nextRun ? new Date(status.stats.nextRun).toLocaleString() : 'Not scheduled'}</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Last Run</div>
                        <div class="metric-value">\${status.stats.lastRun ? new Date(status.stats.lastRun).toLocaleString() : 'Never'}</div>
                    </div>
                \`;
            } catch (error) {
                console.error('Error refreshing status:', error);
            }
        }

        async function loadMetrics() {
            try {
                const metrics = await fetchJSON('/api/metrics');
                document.getElementById('metrics').innerHTML = \`<pre>\${JSON.stringify(metrics, null, 2)}</pre>\`;
            } catch (error) {
                console.error('Error loading metrics:', error);
            }
        }

        async function loadHealth() {
            try {
                const health = await fetchJSON('/health');
                document.getElementById('health').innerHTML = \`<pre>\${JSON.stringify(health, null, 2)}</pre>\`;
            } catch (error) {
                console.error('Error loading health:', error);
            }
        }

        async function triggerManual() {
            try {
                const response = await fetch('/api/trigger', { method: 'POST' });
                const result = await response.json();
                alert(response.ok ? 'Manual job triggered!' : \`Error: \${result.error}\`);
                refreshStatus();
            } catch (error) {
                alert(\`Error: \${error.message}\`);
            }
        }

        async function pauseScheduler() {
            try {
                const response = await fetch('/api/scheduler/pause', { method: 'POST' });
                const result = await response.json();
                alert(response.ok ? 'Scheduler paused!' : \`Error: \${result.error}\`);
                refreshStatus();
            } catch (error) {
                alert(\`Error: \${error.message}\`);
            }
        }

        async function resumeScheduler() {
            try {
                const response = await fetch('/api/scheduler/resume', { method: 'POST' });
                const result = await response.json();
                alert(response.ok ? 'Scheduler resumed!' : \`Error: \${result.error}\`);
                refreshStatus();
            } catch (error) {
                alert(\`Error: \${error.message}\`);
            }
        }

        // Auto-refresh every 30 seconds
        setInterval(() => {
            refreshStatus();
            loadMetrics();
            loadHealth();
        }, 30000);

        // Initial load
        refreshStatus();
        loadMetrics();
        loadHealth();
    </script>
</body>
</html>
    `
  }
}

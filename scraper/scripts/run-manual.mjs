import { CronScheduler } from '../scheduler/CronScheduler.js'
import { logger } from '../monitoring/logger.js'

try {
  const scheduler = new CronScheduler()
  logger.info('🔧 Running one-off manual scraping job...')
  await scheduler.runManual()
  const status = scheduler.getStatus()
  console.log(JSON.stringify({ stats: status.stats }, null, 2))
  process.exit(0)
} catch (e) {
  console.error('Manual run failed:', e)
  process.exit(1)
}



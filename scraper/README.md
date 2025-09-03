# Cartório Paulista - Review Scraper

Automated Google Business Profile review collection system for Cartório Paulista.

## Features

- 🤖 **Automated Scraping**: Hourly collection of reviews from Google Business Profile
- 🔄 **Smart Processing**: Deduplication, validation, and collaborator mention analysis
- 💾 **Supabase Integration**: Direct storage to PostgreSQL database with RLS
- ⏰ **Cron Scheduling**: Configurable automated execution
- 📊 **Monitoring Dashboard**: Real-time status and metrics via web interface
- 🏥 **Health Checks**: Built-in system health monitoring
- 📝 **Comprehensive Logging**: Structured logging with multiple levels
- 🐳 **Docker Ready**: Production-ready containerization

## Architecture

```
scraper/
├── gbp/                 # Google Business Profile scraping
│   └── GBPScraper.js   # Main scraper class
├── processors/          # Data processing and validation
│   └── ReviewProcessor.js
├── storage/            # Database operations
│   └── SupabaseStorage.js
├── scheduler/          # Cron job management
│   └── CronScheduler.js
├── monitoring/         # Logging and dashboard
│   ├── logger.js
│   └── MonitoringDashboard.js
├── config/            # Configuration management
│   └── config.js
└── index.js          # Main application entry point
```

## Prerequisites

- Node.js 18+ 
- Supabase project with PostgreSQL database
- Google Business Profile location

## Installation

1. **Install dependencies**:
   ```bash
   cd scraper
   npm install
   ```

2. **Install Playwright browsers**:
   ```bash
   npm run install-browsers
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Required environment variables**:
   ```env
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GBP_SEARCH_URL=https://www.google.com/maps/place/Your+Business
   ```

## Usage

### Start the Application
```bash
npm start
# or
node index.js start
```

### Run Test Scrape
```bash
node index.js test
```

### Check System Health
```bash
node index.js health
```

### View Configuration
```bash
node index.js config
```

## Monitoring

The application includes a built-in web dashboard:

- **Dashboard**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **Status API**: http://localhost:3001/api/status
- **Metrics API**: http://localhost:3001/api/metrics

### API Endpoints

- `GET /health` - System health check
- `GET /api/status` - Current status and statistics
- `GET /api/metrics` - Detailed metrics
- `POST /api/trigger` - Manually trigger scraping job
- `POST /api/scheduler/pause` - Pause scheduled jobs
- `POST /api/scheduler/resume` - Resume scheduled jobs

## Configuration

### Cron Schedule Examples
```env
# Every hour
CRON_SCHEDULE=0 */1 * * *

# Every 30 minutes
CRON_SCHEDULE=*/30 * * * *

# Business hours only (9 AM - 5 PM)
CRON_SCHEDULE=0 9-17 * * *

# Twice daily (9 AM and 5 PM)
CRON_SCHEDULE=0 9,17 * * *
```

### Logging Levels
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging information

## Data Flow

1. **Scraping**: Playwright navigates to Google Maps and extracts review data
2. **Processing**: Reviews are validated, cleaned, and analyzed for collaborator mentions
3. **Deduplication**: SHA-256 hashing prevents duplicate reviews
4. **Storage**: Valid reviews are saved to Supabase with collaborator links
5. **Monitoring**: All operations are logged and metrics are tracked

## Production Deployment

### Docker (Recommended)

```dockerfile
FROM node:18-alpine

# Install Chromium dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Chromium path
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["npm", "start"]
```

### Railway Deployment

1. **Create Railway project**
2. **Set environment variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GBP_SEARCH_URL`
   - `NODE_ENV=production`
3. **Deploy from Git repository**

### Environment Variables for Production
```env
NODE_ENV=production
PORT=3001
CRON_SCHEDULE=0 */1 * * *
LOG_LEVEL=info
SUPABASE_URL=your-production-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GBP_SEARCH_URL=your-google-maps-url
```

## Troubleshooting

### Common Issues

1. **Browser not found**:
   ```bash
   npm run install-browsers
   ```

2. **Database connection failed**:
   - Check Supabase URL and service key
   - Verify database schema is applied
   - Test with: `node index.js health`

3. **Scraping fails**:
   - Verify Google Maps URL is correct
   - Check if page structure changed
   - Review logs for specific errors

4. **Permission denied**:
   - Ensure service role key has proper permissions
   - Check RLS policies on tables

### Logs Location
- Application logs: `logs/scraper.log`
- Error logs: `logs/error.log`
- Exceptions: `logs/exceptions.log`

### Debug Mode
```bash
LOG_LEVEL=debug node index.js start
```

## Development

### File Structure
- **GBPScraper**: Handles browser automation and data extraction
- **ReviewProcessor**: Validates, cleans, and analyzes review data
- **SupabaseStorage**: Manages database operations and collaborator linking
- **CronScheduler**: Orchestrates automated execution
- **MonitoringDashboard**: Provides web interface and API endpoints

### Adding New Features

1. **New scraping logic**: Modify `GBPScraper.js`
2. **Data processing**: Update `ReviewProcessor.js`
3. **Storage logic**: Extend `SupabaseStorage.js`
4. **Monitoring**: Add metrics to `MonitoringDashboard.js`

## License

MIT License - see LICENSE file for details.

## Support

For issues or questions:
1. Check the logs for error details
2. Use the health check endpoint
3. Review the monitoring dashboard
4. Check database connectivity

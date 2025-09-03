# Multi-stage build for Node.js scraper application
FROM node:18-alpine AS base

# Install system dependencies for Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl

# Set Chromium path for Playwright
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create app user
RUN addgroup --system --gid 1001 scraper
RUN adduser --system --uid 1001 scraper

# Copy dependencies
COPY --from=deps --chown=scraper:scraper /app/node_modules ./node_modules

# Copy application code
COPY --chown=scraper:scraper . .

# Create logs directory
RUN mkdir -p logs && chown scraper:scraper logs

# Switch to app user
USER scraper

# Expose monitoring port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Default command
CMD ["npm", "start"]

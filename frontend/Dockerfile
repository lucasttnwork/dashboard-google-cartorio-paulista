# syntax=docker/dockerfile:1

# ─── Stage 1: build ───────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifest files first so the dependency layer is cached independently
# of source changes. package-lock.json is committed for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_BASE_URL
ARG VITE_SENTRY_DSN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

# ─── Stage 2: serve ───────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# BACKEND_URL is resolved by envsubst at container startup.
# Docker Compose: http://backend:8000
# Railway:        http://backend.railway.internal:8000
ENV BACKEND_URL=http://backend:8000

EXPOSE 80

# Use 127.0.0.1 explicitly: BusyBox wget resolves `localhost` to ::1 first,
# which breaks the healthcheck when nginx is listening only on IPv4. The
# nginx.conf in this image also listens on [::]:80 for good measure.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/ || exit 1

# nginx:alpine's entrypoint auto-runs envsubst on /etc/nginx/templates/*.template
# and outputs to /etc/nginx/conf.d/. No custom entrypoint needed.

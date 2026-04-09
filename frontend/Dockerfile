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
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ─── Stage 2: serve ───────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Use 127.0.0.1 explicitly: BusyBox wget resolves `localhost` to ::1 first,
# which breaks the healthcheck when nginx is listening only on IPv4. The
# nginx.conf in this image also listens on [::]:80 for good measure.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

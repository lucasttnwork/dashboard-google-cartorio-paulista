#!/bin/sh
# Substitute BACKEND_URL, LISTEN_PORT and DNS_RESOLVER into nginx.conf.template,
# leaving nginx-runtime variables ($host etc.) intact.
#
# DNS_RESOLVER: pulled from /etc/resolv.conf at container start, fed to the
# nginx `resolver` directive so the upstream hostname (e.g.
# backend.railway.internal) is re-resolved at request time. Without this nginx
# resolves once at startup and caches the IP forever — when backend gets a
# new private-network IP after a redeploy, every /api/* request 502s until
# the frontend is also redeployed.
set -e
export LISTEN_PORT="${PORT:-80}"
RESOLVER=$(grep -E '^nameserver' /etc/resolv.conf | awk '{print $2}' | tr '\n' ' ')
export DNS_RESOLVER="${RESOLVER:-127.0.0.11}"
envsubst '${BACKEND_URL} ${LISTEN_PORT} ${DNS_RESOLVER}' \
    < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'

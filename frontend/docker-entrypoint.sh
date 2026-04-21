#!/bin/sh
# Substitute BACKEND_URL and LISTEN_PORT, leaving nginx variables ($host etc.) intact.
export LISTEN_PORT="${PORT:-80}"
envsubst '${BACKEND_URL} ${LISTEN_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'

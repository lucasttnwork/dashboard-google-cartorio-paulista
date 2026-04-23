#!/bin/sh
# Substitute BACKEND_URL, LISTEN_PORT and DNS_RESOLVER into nginx.conf.template,
# leaving nginx-runtime variables ($host etc.) intact.
#
# DNS_RESOLVER: pulled from /etc/resolv.conf at container start, fed to the
# nginx `resolver` directive so the upstream hostname (e.g.
# backend.railway.internal) is re-resolved at request time. Without this
# nginx resolves once at startup and caches the IP forever — when backend
# gets a new private-network IP after a redeploy, every /api/* request 502s
# until the frontend is also redeployed.
#
# Railway's internal DNS resolver is IPv6 (e.g. fd12::10) and nginx's
# resolver directive treats unbracketed `:` as a port separator, so any IPv6
# address must be wrapped in [].
export LISTEN_PORT="${PORT:-80}"

resolver_list=""
while read -r ns; do
    [ -z "$ns" ] && continue
    case "$ns" in
        *:*) resolver_list="$resolver_list [$ns]" ;;   # IPv6 → bracketed
        *)   resolver_list="$resolver_list $ns" ;;
    esac
done <<EOF
$(grep -E '^[[:space:]]*nameserver' /etc/resolv.conf | awk '{print $2}')
EOF

# Trim leading whitespace; fall back to Docker's embedded DNS if /etc/resolv.conf
# was somehow empty (shouldn't happen on Railway, but a fallback keeps the
# container from emerg-ing instead of serving).
resolver_list=$(echo "$resolver_list" | sed 's/^ *//')
export DNS_RESOLVER="${resolver_list:-127.0.0.11}"

echo "[entrypoint] DNS_RESOLVER='$DNS_RESOLVER'"

envsubst '${BACKEND_URL} ${LISTEN_PORT} ${DNS_RESOLVER}' \
    < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'

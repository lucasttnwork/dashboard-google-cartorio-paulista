#!/usr/bin/env bash
# Thin wrapper over railway_ensure_target_ports.py. See that file + docs/deploy-railway.md.
# Usage:
#   export RAILWAY_TOKEN=<Project Access Token>
#   bash scripts/railway-ensure-target-ports.sh [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$here/railway_ensure_target_ports.py" "$@"

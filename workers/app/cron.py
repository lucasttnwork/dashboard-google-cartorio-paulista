from __future__ import annotations

# Cron jobs are intentionally empty in Phase -1.
# Phase 4 (scraper rebuild) populates this list with arq ``cron`` entries
# for the periodic Google review sync and collaborator matching jobs.
cron_jobs: list = []

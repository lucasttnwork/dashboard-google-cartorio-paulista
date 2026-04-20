from __future__ import annotations

from arq.cron import cron

from app.tasks.collect_reviews import collect_reviews

cron_jobs = [
    cron(
        collect_reviews,
        weekday={0, 1, 2, 3, 4},
        hour={0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22},
        minute=0,
        run_at_startup=False,
    ),
    cron(
        collect_reviews,
        weekday={5, 6},
        hour=8,
        minute=0,
        run_at_startup=False,
    ),
]

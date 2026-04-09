from __future__ import annotations

import asyncio

from arq.connections import RedisSettings
from arq.worker import create_worker

from app import health_server
from app.settings import settings
from app.tasks.example import example_task


class WorkerSettings:
    """arq WorkerSettings — canonical entry point for the worker runtime.

    Phase 4 will populate ``cron_jobs`` and wire real startup/shutdown
    hooks (DB pool, httpx client, Sentry). For Phase -1 this is an
    intentionally minimal scaffold that only exposes the example task.
    """

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [example_task]
    cron_jobs: list = []  # noqa: RUF012 — populated in Phase 4
    on_startup = None
    on_shutdown = None
    max_jobs = 10


async def main() -> None:
    """Run the health HTTP server and the arq worker concurrently.

    Both coroutines live in the same event loop inside a single
    container process. If either one exits, ``asyncio.gather`` will
    propagate the exception and the container will restart under
    Railway's restart policy.
    """

    worker = create_worker(WorkerSettings)  # type: ignore[arg-type]
    await asyncio.gather(
        health_server.run(settings.health_port),
        worker.async_run(),
    )


if __name__ == "__main__":
    asyncio.run(main())

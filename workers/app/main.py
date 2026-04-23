from __future__ import annotations

import asyncio

import asyncpg
import httpx
import structlog
from apify_client import ApifyClientAsync
from arq.connections import RedisSettings
from arq.worker import create_worker

from app import health_server
from app.cron import cron_jobs
from app.settings import settings
from app.tasks.collect_reviews import collect_reviews
from app.tasks.example import example_task
from app.tasks.analyze_review import analyze_review, analyze_reviews_batch
from app.tasks.backfill_sentiment import backfill_sentiment
from app.tasks.reprocess_mentions import reprocess_collaborator_mentions

logger = structlog.get_logger(__name__)


async def on_startup(ctx: dict) -> None:
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    ctx["db_pool"] = await asyncpg.create_pool(dsn, statement_cache_size=0) if dsn else None
    ctx["http_client"] = httpx.AsyncClient(timeout=60)
    ctx["apify_client"] = ApifyClientAsync(token=settings.apify_token) if settings.apify_token else None
    logger.info("worker.startup", db_pool=ctx["db_pool"] is not None, apify=ctx["apify_client"] is not None)


async def on_shutdown(ctx: dict) -> None:
    if pool := ctx.get("db_pool"):
        await pool.close()
    if client := ctx.get("http_client"):
        await client.aclose()
    if apify := ctx.get("apify_client"):
        # ApifyClientAsync doesn't have a close method — it uses httpx internally
        if hasattr(apify, "http_client") and apify.http_client:
            await apify.http_client.aclose()
    logger.info("worker.shutdown")


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [
        example_task,
        reprocess_collaborator_mentions,
        collect_reviews,
        analyze_review,
        analyze_reviews_batch,
        backfill_sentiment,
    ]
    cron_jobs = cron_jobs
    on_startup = on_startup
    on_shutdown = on_shutdown
    max_jobs = 10


async def main() -> None:
    worker = create_worker(WorkerSettings)  # type: ignore[arg-type]
    await asyncio.gather(
        health_server.run(settings.health_port),
        worker.async_run(),
    )


if __name__ == "__main__":
    asyncio.run(main())

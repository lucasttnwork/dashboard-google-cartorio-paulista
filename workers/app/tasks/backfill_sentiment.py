"""arq task: enqueue analyze_reviews_batch for reviews missing sentiment.

Used to recover coverage after the sentiment migration (2026-04-20) and after
manual backfills that bypass the collector's auto-enqueue path. Reads reviews
where sentiment IS NULL (and analysis_failed if requested), chunks ids by
nlp_batch_size, enqueues one job per chunk.
"""

from __future__ import annotations

import structlog

from app.settings import settings

logger = structlog.get_logger(__name__)


async def backfill_sentiment(
    ctx: dict,
    *,
    include_failed: bool = False,
    limit: int | None = None,
    dry_run: bool = False,
) -> dict:
    pool = ctx.get("db_pool")
    redis = ctx.get("redis")

    if not pool:
        return {"status": "error", "reason": "no_db_pool"}
    if not redis and not dry_run:
        return {"status": "error", "reason": "no_redis"}

    where_clauses = ["comment IS NOT NULL", "comment <> ''"]
    if include_failed:
        where_clauses.append("(sentiment IS NULL OR sentiment = 'analysis_failed')")
    else:
        where_clauses.append("sentiment IS NULL")

    sql = (
        "SELECT review_id FROM reviews WHERE "
        + " AND ".join(where_clauses)
        + " ORDER BY create_time DESC NULLS LAST"
    )
    if limit:
        sql += f" LIMIT {int(limit)}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    review_ids = [row["review_id"] for row in rows]

    batch_size = max(1, settings.nlp_batch_size)
    batches = [
        review_ids[i:i + batch_size]
        for i in range(0, len(review_ids), batch_size)
    ]

    enqueued = 0
    failed = 0
    if not dry_run:
        for chunk in batches:
            try:
                await redis.enqueue_job("analyze_reviews_batch", review_ids=chunk)
                enqueued += 1
            except Exception as exc:
                failed += 1
                logger.warning(
                    "backfill_sentiment.enqueue_failed",
                    chunk_size=len(chunk),
                    error=str(exc),
                )

    logger.info(
        "backfill_sentiment.completed",
        reviews=len(review_ids),
        batches=len(batches),
        enqueued=enqueued,
        failed=failed,
        dry_run=dry_run,
        include_failed=include_failed,
    )
    return {
        "status": "completed",
        "reviews": len(review_ids),
        "batches": len(batches),
        "enqueued": enqueued,
        "failed": failed,
        "dry_run": dry_run,
    }

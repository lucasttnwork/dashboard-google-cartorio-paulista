from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from app.settings import settings
from app.transforms.apify import transform_apify_review

logger = structlog.get_logger(__name__)

ACTOR_ID = "compass/Google-Maps-Reviews-Scraper"
POLL_INTERVAL = 10
ACTOR_TIMEOUT = 300


async def _check_degraded(pool, redis) -> bool:
    """Return True if last 4 collection_runs all failed → degrade."""
    if redis:
        degraded = await redis.get("collection:degraded")
        if degraded:
            logger.warning("collect.degraded_mode", source="redis_key")
            return True

    if not pool:
        return False

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT status FROM collection_runs ORDER BY id DESC LIMIT 4"
        )

    if len(rows) >= 4 and all(r["status"] != "completed" for r in rows):
        if redis:
            await redis.setex("collection:degraded", 86400, "1")
        logger.warning("collect.degraded_mode", source="consecutive_failures")
        return True

    return False


async def _record_run(pool, *, source: str, status: str, reviews_new: int = 0,
                      reviews_skipped: int = 0, started_at: datetime,
                      completed_at: datetime | None = None,
                      error_message: str | None = None) -> int | None:
    if not pool:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO collection_runs
               (location_id, run_type, status, started_at, completed_at, ended_at,
                reviews_new, reviews_found, error_message)
               VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)
               RETURNING id""",
            settings.location_id, source, status, started_at, completed_at,
            reviews_new, reviews_new + reviews_skipped, error_message,
        )
        return row["id"] if row else None


async def _compute_window_hours(pool, default_hours: int) -> int:
    """Compute fetch window: time since last successful run + 1h overlap.

    Guarantees zero gaps across weekday/weekend cadence boundaries. If no
    successful run exists, falls back to `default_hours` (initial bootstrap).
    Capped at 168h (7 days) to avoid runaway backfill.
    """
    if not pool:
        return default_hours
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT completed_at FROM collection_runs "
            "WHERE status = 'completed' AND completed_at IS NOT NULL "
            "ORDER BY completed_at DESC LIMIT 1"
        )
    if not row or not row["completed_at"]:
        return default_hours
    delta = datetime.now(timezone.utc) - row["completed_at"]
    hours = int(delta.total_seconds() / 3600) + 1  # +1h overlap
    return max(default_hours, min(hours, 168))


async def collect_reviews(ctx: dict) -> dict:
    """Collect reviews from Apify and upsert into DB."""
    if not settings.collection_enabled:
        logger.info("collect.disabled")
        return {"status": "disabled"}

    pool = ctx.get("db_pool")
    redis = ctx.get("redis")
    apify_client = ctx.get("apify_client")
    started_at = datetime.now(timezone.utc)

    if await _check_degraded(pool, redis):
        return {"status": "degraded"}

    if not apify_client:
        logger.error("collect.no_apify_client")
        return {"status": "error", "reason": "no_apify_client"}

    window_hours = await _compute_window_hours(pool, settings.collection_window_hours)
    logger.info("collect.window", hours=window_hours)

    run_input = {
        "startUrls": [{"url": settings.google_place_url}],
        "reviewsSort": "newest",
        "reviewsStartDate": f"{window_hours} hours",
        "language": "pt-BR",
        "personalData": True,
        "maxReviews": 500,
    }

    actor_run = None
    retries = 0
    max_retries = 1

    while retries <= max_retries:
        try:
            actor_run = await apify_client.actor(ACTOR_ID).call(run_input=run_input)
            break
        except Exception as exc:
            if retries < max_retries:
                logger.warning("collect.actor_call_failed_retrying", error=str(exc))
                retries += 1
                await asyncio.sleep(60)
            else:
                logger.error("collect.actor_call_failed", error=str(exc))
                await _record_run(
                    pool, source="scheduled", status="failed",
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                    error_message=str(exc),
                )
                return {"status": "error", "error": str(exc)}

    if not actor_run:
        return {"status": "error", "error": "no_actor_run"}

    run_status = actor_run.get("status")
    if run_status == "FAILED":
        await _record_run(
            pool, source="scheduled", status="failed",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
            error_message="actor_failed",
        )
        return {"status": "error", "error": "actor_failed"}

    if run_status == "TIMED-OUT":
        await _record_run(
            pool, source="scheduled", status="failed",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
            error_message="actor_timeout",
        )
        return {"status": "timeout"}

    dataset_id = actor_run.get("defaultDatasetId")
    if not dataset_id:
        return {"status": "error", "error": "no_dataset_id"}

    items = []
    dataset_client = apify_client.dataset(dataset_id)
    list_page = await dataset_client.list_items()
    items = list_page.items if list_page else []

    if not items:
        await _record_run(
            pool, source="scheduled", status="completed",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
        return {"status": "completed", "new": 0, "skipped": 0}

    transformed = []
    for raw in items:
        try:
            transformed.append(transform_apify_review(raw))
        except (KeyError, TypeError) as exc:
            logger.warning("collect.transform_error", error=str(exc), raw_keys=list(raw.keys()))

    new_count = 0
    skipped_count = 0
    new_review_ids: list[str] = []

    if pool and transformed:
        async with pool.acquire() as conn:
            for review in transformed:
                result = await conn.fetchrow(
                    """INSERT INTO reviews
                       (review_id, location_id, rating, comment, reviewer_name,
                        reviewer_id, reviewer_url, review_url, is_local_guide,
                        reviewer_photo_url, original_language, translated_text,
                        create_time, response_text, response_time,
                        last_seen_at, source, collection_source)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                               $13,$14,$15,
                               now(),$16,'auto')
                       ON CONFLICT (review_id) DO UPDATE SET
                           comment = EXCLUDED.comment,
                           rating = EXCLUDED.rating,
                           response_text = EXCLUDED.response_text,
                           response_time = EXCLUDED.response_time,
                           last_seen_at = now()
                       RETURNING (xmax = 0) AS is_new""",
                    review["review_id"], review["location_id"],
                    review["rating"], review["comment"],
                    review["reviewer_name"], review.get("reviewer_id"),
                    review["reviewer_url"], review["review_url"],
                    review["is_local_guide"], review["reviewer_photo_url"],
                    review["original_language"], review["translated_text"],
                    review["create_time"], review["response_text"],
                    review["response_time"], review["source"],
                )
                if result and result["is_new"]:
                    new_count += 1
                    new_review_ids.append(review["review_id"])
                else:
                    skipped_count += 1

    completed_at = datetime.now(timezone.utc)
    await _record_run(
        pool, source="scheduled", status="completed",
        reviews_new=new_count, reviews_skipped=skipped_count,
        started_at=started_at, completed_at=completed_at,
    )

    redis = ctx.get("redis")
    for review_id in new_review_ids:
        try:
            if redis:
                await redis.enqueue_job("analyze_review", review_id=review_id)
        except Exception as exc:
            logger.warning("collect.enqueue_nlp_failed", review_id=review_id, error=str(exc))

    logger.info(
        "collect.completed",
        new=new_count, skipped=skipped_count, total_items=len(items),
    )
    return {"status": "completed", "new": new_count, "skipped": skipped_count}

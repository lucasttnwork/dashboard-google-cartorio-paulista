from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import structlog

from app.settings import settings
from app.transforms.apify import transform_apify_review

logger = structlog.get_logger(__name__)

ACTOR_ID = "compass/Google-Maps-Reviews-Scraper"
POLL_INTERVAL = 10
ACTOR_TIMEOUT = 300

BACKFILL_WINDOW_CAP_HOURS = 24 * 90


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


async def collect_reviews(
    ctx: dict,
    *,
    window_hours_override: int | None = None,
    source_label: str = "scheduled",
    max_reviews: int = 500,
) -> dict:
    """Collect reviews from Apify and upsert into DB.

    Optional kwargs (used by manual/backfill enqueues):
    - window_hours_override: bypass the auto-computed window. Skips degraded
      check. Capped at BACKFILL_WINDOW_CAP_HOURS.
    - source_label: stored on collection_runs.run_type ('scheduled' | 'manual' | 'backfill').
    - max_reviews: ceiling for Apify scrape size (raise for backfills).
    """
    if not settings.collection_enabled:
        logger.info("collect.disabled")
        return {"status": "disabled"}

    pool = ctx.get("db_pool")
    redis = ctx.get("redis")
    apify_client = ctx.get("apify_client")
    started_at = datetime.now(timezone.utc)
    batch_id = str(uuid4())
    is_backfill = window_hours_override is not None

    if not is_backfill and await _check_degraded(pool, redis):
        return {"status": "degraded"}

    if not apify_client:
        logger.error("collect.no_apify_client")
        return {"status": "error", "reason": "no_apify_client"}

    if is_backfill:
        window_hours = max(1, min(int(window_hours_override), BACKFILL_WINDOW_CAP_HOURS))
    else:
        window_hours = await _compute_window_hours(pool, settings.collection_window_hours)
    logger.info(
        "collect.window",
        hours=window_hours,
        batch_id=batch_id,
        source=source_label,
        backfill=is_backfill,
    )

    if window_hours > 24:
        days = (window_hours + 23) // 24
        reviews_start = f"{days} days"
    else:
        reviews_start = f"{window_hours} hours"

    run_input = {
        "startUrls": [{"url": settings.google_place_url}],
        "reviewsSort": "newest",
        "reviewsStartDate": reviews_start,
        "language": "pt-BR",
        "personalData": True,
        "maxReviews": max_reviews,
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
                    pool, source=source_label, status="failed",
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
            pool, source=source_label, status="failed",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
            error_message="actor_failed",
        )
        return {"status": "error", "error": "actor_failed"}

    if run_status == "TIMED-OUT":
        await _record_run(
            pool, source=source_label, status="failed",
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
            pool, source=source_label, status="completed",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
        return {"status": "completed", "new": 0, "skipped": 0, "batch_id": batch_id}

    transformed = []
    for raw in items:
        try:
            transformed.append(transform_apify_review(raw))
        except (KeyError, TypeError) as exc:
            logger.warning("collect.transform_error", error=str(exc), raw_keys=list(raw.keys()))

    new_count = 0
    skipped_count = 0
    new_review_ids: list[str] = []

    collection_source_label = "manual" if is_backfill else "auto"

    if pool and transformed:
        async with pool.acquire() as conn:
            for review in transformed:
                result = await conn.fetchrow(
                    """INSERT INTO reviews
                       (review_id, location_id, rating, comment, reviewer_name,
                        reviewer_id, reviewer_url, review_url, is_local_guide,
                        reviewer_photo_url, original_language, translated_text,
                        create_time, response_text, response_time,
                        last_seen_at, last_checked_at, source,
                        collection_source, collection_batch_id)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                               $13,$14,$15,
                               now(), now(), $16,
                               $17, $18)
                       ON CONFLICT (review_id) DO UPDATE SET
                           comment = EXCLUDED.comment,
                           rating = EXCLUDED.rating,
                           response_text = EXCLUDED.response_text,
                           response_time = EXCLUDED.response_time,
                           last_seen_at = now(),
                           last_checked_at = now(),
                           collection_batch_id = EXCLUDED.collection_batch_id
                       RETURNING (xmax = 0) AS is_new""",
                    review["review_id"], review["location_id"],
                    review["rating"], review["comment"],
                    review["reviewer_name"], review.get("reviewer_id"),
                    review["reviewer_url"], review["review_url"],
                    review["is_local_guide"], review["reviewer_photo_url"],
                    review["original_language"], review["translated_text"],
                    review["create_time"], review["response_text"],
                    review["response_time"], review["source"],
                    collection_source_label, batch_id,
                )
                if result and result["is_new"]:
                    new_count += 1
                    new_review_ids.append(review["review_id"])
                else:
                    skipped_count += 1

    completed_at = datetime.now(timezone.utc)
    await _record_run(
        pool, source=source_label, status="completed",
        reviews_new=new_count, reviews_skipped=skipped_count,
        started_at=started_at, completed_at=completed_at,
    )

    redis = ctx.get("redis")
    enqueue_ids: list[str] = list(new_review_ids)
    if is_backfill and pool:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT review_id FROM reviews
                   WHERE collection_batch_id = $1
                     AND sentiment IS NULL
                     AND comment IS NOT NULL AND comment <> ''""",
                batch_id,
            )
        seen = set(enqueue_ids)
        for row in rows:
            rid = row["review_id"]
            if rid not in seen:
                enqueue_ids.append(rid)
                seen.add(rid)

    if redis and enqueue_ids:
        batch_size = max(1, settings.nlp_batch_size)
        for start in range(0, len(enqueue_ids), batch_size):
            batch = enqueue_ids[start:start + batch_size]
            try:
                await redis.enqueue_job("analyze_reviews_batch", review_ids=batch)
            except Exception as exc:
                logger.warning(
                    "collect.enqueue_nlp_failed",
                    batch_size=len(batch),
                    error=str(exc),
                )

    logger.info(
        "collect.completed",
        new=new_count, skipped=skipped_count, total_items=len(items),
        batch_id=batch_id, nlp_enqueued=len(enqueue_ids),
    )
    return {
        "status": "completed",
        "new": new_count,
        "skipped": skipped_count,
        "batch_id": batch_id,
        "nlp_enqueued": len(enqueue_ids),
    }

"""
Import Apify Google Maps Reviews Scraper dataset into the database.

Transforms Apify JSON format and upserts into reviews + reviews_raw tables,
replicating the logic of persist_reviews_atomic() but with proper parameter binding.

Usage (inside backend container):
    python /scripts/import_apify_dataset.py /data/dataset.json
"""
from __future__ import annotations

import json
import sys
import os
import asyncio

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text


LOCATION_ID = "cartorio-paulista-location"
BATCH_SIZE = 50


def transform_apify_review(raw: dict) -> dict:
    """Map Apify scraper JSON fields to database columns."""
    return {
        "review_id": raw["reviewId"],
        "rating": raw.get("stars"),
        "comment": raw.get("text"),
        "reviewer_name": raw.get("name"),
        "reviewer_id": raw.get("reviewerId"),
        "reviewer_url": raw.get("reviewerUrl"),
        "review_url": raw.get("reviewUrl"),
        "is_local_guide": raw.get("isLocalGuide"),
        "reviewer_photo_url": raw.get("reviewerPhotoUrl"),
        "original_language": raw.get("originalLanguage"),
        "translated_text": raw.get("textTranslated"),
        "create_time": raw.get("publishedAtDate"),
        "update_time": raw.get("publishedAtDate"),
        "response_text": raw.get("responseFromOwnerText"),
        "response_time": raw.get("responseFromOwnerDate"),
        "source": "apify",
        "raw_payload": json.dumps(raw),
    }


UPSERT_RAW_SQL = text("""
    INSERT INTO reviews_raw (review_id, location_id, payload, raw_payload, received_at, last_seen_at)
    VALUES (:review_id, :location_id, CAST(:raw_payload AS jsonb), CAST(:raw_payload AS jsonb), now(), now())
    ON CONFLICT (review_id) DO UPDATE SET
        payload = CAST(EXCLUDED.payload AS jsonb),
        raw_payload = CAST(EXCLUDED.raw_payload AS jsonb),
        last_seen_at = now()
""")

UPSERT_REVIEW_SQL = text("""
    INSERT INTO reviews (
        review_id, location_id, rating, comment, reviewer_name,
        reviewer_id, reviewer_url, review_url, is_local_guide,
        reviewer_photo_url, original_language, translated_text,
        create_time, update_time, response_text, response_time,
        last_seen_at, source, collection_source
    ) VALUES (
        :review_id, :location_id, :rating, :comment, :reviewer_name,
        :reviewer_id, :reviewer_url, :review_url, :is_local_guide,
        :reviewer_photo_url, :original_language, :translated_text,
        CAST(NULLIF(:create_time, '') AS timestamptz),
        CAST(NULLIF(:update_time, '') AS timestamptz),
        :response_text,
        CAST(NULLIF(:response_time, '') AS timestamptz),
        now(), :source, 'manual'
    )
    ON CONFLICT (review_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        reviewer_name = EXCLUDED.reviewer_name,
        reviewer_id = EXCLUDED.reviewer_id,
        reviewer_url = EXCLUDED.reviewer_url,
        review_url = EXCLUDED.review_url,
        is_local_guide = EXCLUDED.is_local_guide,
        reviewer_photo_url = EXCLUDED.reviewer_photo_url,
        original_language = EXCLUDED.original_language,
        translated_text = EXCLUDED.translated_text,
        update_time = EXCLUDED.update_time,
        response_text = EXCLUDED.response_text,
        response_time = EXCLUDED.response_time,
        last_seen_at = now(),
        source = EXCLUDED.source
""")


async def main(json_path: str) -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    db_url = (
        db_url
        .replace("postgresql://", "postgresql+asyncpg://", 1)
        .replace("postgres://", "postgresql+asyncpg://", 1)
    )

    with open(json_path, encoding="utf-8") as f:
        raw_reviews = json.load(f)

    total = len(raw_reviews)
    print(f"Loaded {total} reviews from {json_path}")

    transformed = [transform_apify_review(r) for r in raw_reviews]

    engine = create_async_engine(db_url, echo=False)

    async with engine.begin() as conn:
        # 1. Check existing review_ids
        review_ids = [r["review_id"] for r in transformed]
        existing_ids: set[str] = set()
        chunk_size = 500
        for i in range(0, len(review_ids), chunk_size):
            chunk = review_ids[i : i + chunk_size]
            result = await conn.execute(
                text("SELECT review_id FROM reviews WHERE review_id = ANY(:ids)"),
                {"ids": chunk},
            )
            existing_ids.update(row[0] for row in result.fetchall())

        new_count = sum(1 for r in transformed if r["review_id"] not in existing_ids)
        upd_count = sum(1 for r in transformed if r["review_id"] in existing_ids)
        print(f"Classification: {new_count} new, {upd_count} updates")

        # 2. Create collection_run
        result = await conn.execute(
            text("""
                INSERT INTO collection_runs (location_id, run_type, status, started_at, reviews_found)
                VALUES (:loc, 'manual', 'running', now(), :found)
                RETURNING id
            """),
            {"loc": LOCATION_ID, "found": total},
        )
        run_id = result.scalar_one()
        print(f"Created collection_run id={run_id}")

        # 3. Upsert reviews_raw + reviews in batches
        inserted = 0
        updated = 0

        for i in range(0, len(transformed), BATCH_SIZE):
            batch = transformed[i : i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            total_batches = (len(transformed) + BATCH_SIZE - 1) // BATCH_SIZE

            for review in batch:
                params = {
                    "review_id": review["review_id"],
                    "location_id": LOCATION_ID,
                    "raw_payload": review["raw_payload"],
                }
                await conn.execute(UPSERT_RAW_SQL, params)

                params = {
                    "review_id": review["review_id"],
                    "location_id": LOCATION_ID,
                    "rating": review["rating"],
                    "comment": review["comment"],
                    "reviewer_name": review["reviewer_name"],
                    "reviewer_id": review["reviewer_id"],
                    "reviewer_url": review["reviewer_url"],
                    "review_url": review["review_url"],
                    "is_local_guide": review["is_local_guide"],
                    "reviewer_photo_url": review["reviewer_photo_url"],
                    "original_language": review["original_language"],
                    "translated_text": review["translated_text"],
                    "create_time": review["create_time"] or "",
                    "update_time": review["update_time"] or "",
                    "response_text": review["response_text"],
                    "response_time": review["response_time"] or "",
                    "source": review["source"],
                }
                await conn.execute(UPSERT_REVIEW_SQL, params)

                if review["review_id"] in existing_ids:
                    updated += 1
                else:
                    inserted += 1

            print(f"  Batch {batch_num}/{total_batches}: processed {len(batch)} reviews")

        # 4. Finalize collection_run
        await conn.execute(
            text("""
                UPDATE collection_runs
                SET status = 'completed',
                    completed_at = now(),
                    ended_at = now(),
                    reviews_new = :new,
                    reviews_updated = :upd,
                    reviews_found = :found
                WHERE id = :run_id
            """),
            {"new": inserted, "upd": updated, "found": total, "run_id": run_id},
        )

        # 5. Update gbp_locations metrics
        await conn.execute(
            text("""
                UPDATE gbp_locations
                SET last_review_sync = now(),
                    total_reviews_count = (SELECT count(*) FROM reviews WHERE location_id = :loc),
                    metrics_last_updated = now()
                WHERE location_id = :loc
            """),
            {"loc": LOCATION_ID},
        )

    await engine.dispose()

    print(f"\nImport complete:")
    print(f"  New:     {inserted}")
    print(f"  Updated: {updated}")
    print(f"  Total:   {inserted + updated}")
    print(f"  Run ID:  {run_id}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-json>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))

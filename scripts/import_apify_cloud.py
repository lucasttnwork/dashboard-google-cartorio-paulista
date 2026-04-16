"""
Import Apify dataset into Supabase CLOUD via PostgREST API.

Uses service_role key for full table access. Upserts into reviews + reviews_raw
via Prefer: resolution=merge-duplicates header.

Usage:
    python scripts/import_apify_cloud.py /path/to/dataset.json
"""
from __future__ import annotations

import json
import sys
import os
from datetime import datetime, timezone

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LOCATION_ID = "cartorio-paulista-location"
BATCH_SIZE = 50
REST_URL = f"{SUPABASE_URL}/rest/v1"


def headers(*, upsert: bool = False, count: bool = False) -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    prefs = []
    if upsert:
        prefs.append("resolution=merge-duplicates")
    if count:
        prefs.append("count=exact")
    prefs.append("return=representation")
    h["Prefer"] = ", ".join(prefs)
    return h


def transform_for_reviews_raw(raw: dict) -> dict:
    return {
        "review_id": raw["reviewId"],
        "location_id": LOCATION_ID,
        "payload": raw,
        "raw_payload": raw,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }


def transform_for_reviews(raw: dict) -> dict:
    return {
        "review_id": raw["reviewId"],
        "location_id": LOCATION_ID,
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
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "source": "apify",
        "collection_source": "manual",
    }


def main(json_path: str) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        raw_reviews = json.load(f)

    total = len(raw_reviews)
    print(f"Loaded {total} reviews from {json_path}")

    client = httpx.Client(timeout=60.0)

    # 1. Create collection_run
    run_payload = {
        "location_id": LOCATION_ID,
        "run_type": "manual",
        "status": "running",
        "reviews_found": total,
    }
    resp = client.post(
        f"{REST_URL}/collection_runs",
        headers=headers(),
        json=run_payload,
    )
    resp.raise_for_status()
    run_data = resp.json()
    run_id = run_data[0]["id"] if isinstance(run_data, list) else run_data["id"]
    print(f"Created collection_run id={run_id}")

    # 2. Upsert reviews_raw in batches
    print("Upserting reviews_raw...")
    raw_rows = [transform_for_reviews_raw(r) for r in raw_reviews]
    for i in range(0, len(raw_rows), BATCH_SIZE):
        batch = raw_rows[i : i + BATCH_SIZE]
        resp = client.post(
            f"{REST_URL}/reviews_raw?on_conflict=review_id",
            headers=headers(upsert=True),
            json=batch,
        )
        resp.raise_for_status()
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(raw_rows) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  reviews_raw batch {batch_num}/{total_batches}: {len(batch)} rows")

    # 3. Upsert reviews in batches
    print("Upserting reviews...")
    review_rows = [transform_for_reviews(r) for r in raw_reviews]
    for i in range(0, len(review_rows), BATCH_SIZE):
        batch = review_rows[i : i + BATCH_SIZE]
        resp = client.post(
            f"{REST_URL}/reviews?on_conflict=review_id",
            headers=headers(upsert=True),
            json=batch,
        )
        resp.raise_for_status()
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(review_rows) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  reviews batch {batch_num}/{total_batches}: {len(batch)} rows")

    # 4. Get final count for metrics
    resp = client.get(
        f"{REST_URL}/reviews?select=review_id&limit=1",
        headers={
            **headers(count=True),
            "Range": "0-0",
        },
    )
    content_range = resp.headers.get("content-range", "")
    final_count = int(content_range.split("/")[-1]) if "/" in content_range else 0

    # 5. Finalize collection_run
    resp = client.patch(
        f"{REST_URL}/collection_runs?id=eq.{run_id}",
        headers=headers(),
        json={
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "reviews_found": total,
            "reviews_new": total,  # approximate — PostgREST doesn't return inserted vs updated count
        },
    )
    resp.raise_for_status()

    # 6. Update gbp_locations metrics
    resp = client.patch(
        f"{REST_URL}/gbp_locations?location_id=eq.{LOCATION_ID}",
        headers=headers(),
        json={
            "last_review_sync": datetime.now(timezone.utc).isoformat(),
            "total_reviews_count": final_count,
            "metrics_last_updated": datetime.now(timezone.utc).isoformat(),
        },
    )
    resp.raise_for_status()

    client.close()

    print(f"\nImport to cloud complete:")
    print(f"  Processed: {total}")
    print(f"  Total reviews in cloud: {final_count}")
    print(f"  Run ID: {run_id}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-json>")
        sys.exit(1)
    main(sys.argv[1])

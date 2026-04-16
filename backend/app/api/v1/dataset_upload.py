"""/api/v1/dataset-upload endpoint.

Admin-only endpoint to upload Apify Google Maps Reviews Scraper JSON datasets.
Validates, transforms and upserts reviews into the database without duplication.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import AuthenticatedUser, require_role
from app.deps.db import get_session

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["dataset-upload"])

AdminOnly = Annotated[AuthenticatedUser, Depends(require_role("admin"))]

LOCATION_ID = "cartorio-paulista-location"
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
BATCH_SIZE = 50


class DatasetUploadResponse(BaseModel):
    total_processed: int
    new_reviews: int
    updated_reviews: int
    collection_run_id: int
    total_in_database: int


class CollectionRunOut(BaseModel):
    id: int
    run_type: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    reviews_found: int
    reviews_new: int
    reviews_updated: int


def _transform_apify_review(raw: dict) -> dict:
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


def _validate_apify_dataset(data: list) -> None:
    """Validate that the JSON is an Apify Google Maps Reviews dataset."""
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="json_must_be_array")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="empty_dataset")
    sample = data[0]
    required = {"reviewId", "stars", "publishedAtDate"}
    missing = required - set(sample.keys())
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"invalid_dataset_format: missing fields {missing}",
        )


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


@router.get("/history", response_model=list[CollectionRunOut])
async def list_collection_runs(
    user: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[CollectionRunOut]:
    """List collection runs ordered by most recent first."""
    result = await session.execute(
        text("""
            SELECT id, run_type, status, started_at, completed_at,
                   COALESCE(reviews_found, 0),
                   COALESCE(reviews_new, 0),
                   COALESCE(reviews_updated, 0)
            FROM collection_runs
            WHERE run_type = 'manual'
            ORDER BY id DESC
            LIMIT 50
        """)
    )
    return [
        CollectionRunOut(
            id=row[0],
            run_type=row[1],
            status=row[2],
            started_at=row[3],
            completed_at=row[4],
            reviews_found=row[5],
            reviews_new=row[6],
            reviews_updated=row[7],
        )
        for row in result.fetchall()
    ]


@router.post("/", response_model=DatasetUploadResponse)
async def upload_dataset(
    user: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile,
) -> DatasetUploadResponse:
    """Upload an Apify Google Maps Reviews Scraper JSON dataset.

    Validates the file, transforms each review to the internal schema,
    and upserts into reviews + reviews_raw. Existing reviews are updated
    (no duplication). A collection_run is created for traceability.
    """
    if file.content_type and file.content_type not in (
        "application/json",
        "text/json",
        "application/octet-stream",
    ):
        raise HTTPException(status_code=400, detail="file_must_be_json")

    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="file_too_large")

    try:
        data = json.loads(raw_bytes.decode("utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="invalid_json") from exc

    _validate_apify_dataset(data)

    transformed = [_transform_apify_review(r) for r in data]
    total = len(transformed)

    logger.info(
        "dataset_upload.start",
        user_id=str(user.id),
        file_name=file.filename,
        total_reviews=total,
    )

    # Classify new vs existing
    review_ids = [r["review_id"] for r in transformed]
    existing_ids: set[str] = set()
    chunk_size = 500
    for i in range(0, len(review_ids), chunk_size):
        chunk = review_ids[i : i + chunk_size]
        result = await session.execute(
            text("SELECT review_id FROM reviews WHERE review_id = ANY(:ids)"),
            {"ids": chunk},
        )
        existing_ids.update(row[0] for row in result.fetchall())

    new_count = sum(1 for r in transformed if r["review_id"] not in existing_ids)
    upd_count = sum(1 for r in transformed if r["review_id"] in existing_ids)

    # Create collection_run
    result = await session.execute(
        text("""
            INSERT INTO collection_runs (location_id, run_type, status, started_at, reviews_found)
            VALUES (:loc, 'manual', 'running', now(), :found)
            RETURNING id
        """),
        {"loc": LOCATION_ID, "found": total},
    )
    run_id = result.scalar_one()

    # Upsert in batches
    for i in range(0, len(transformed), BATCH_SIZE):
        batch = transformed[i : i + BATCH_SIZE]
        for review in batch:
            await session.execute(
                UPSERT_RAW_SQL,
                {
                    "review_id": review["review_id"],
                    "location_id": LOCATION_ID,
                    "raw_payload": review["raw_payload"],
                },
            )
            await session.execute(
                UPSERT_REVIEW_SQL,
                {
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
                },
            )

    # Finalize collection_run
    await session.execute(
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
        {"new": new_count, "upd": upd_count, "found": total, "run_id": run_id},
    )

    # Update gbp_locations metrics
    total_result = await session.execute(
        text("SELECT count(*) FROM reviews WHERE location_id = :loc"),
        {"loc": LOCATION_ID},
    )
    total_in_db = total_result.scalar_one()

    await session.execute(
        text("""
            UPDATE gbp_locations
            SET last_review_sync = now(),
                total_reviews_count = :total,
                metrics_last_updated = now()
            WHERE location_id = :loc
        """),
        {"loc": LOCATION_ID, "total": total_in_db},
    )

    await session.commit()

    logger.info(
        "dataset_upload.complete",
        user_id=str(user.id),
        new=new_count,
        updated=upd_count,
        total_in_db=total_in_db,
        run_id=run_id,
    )

    return DatasetUploadResponse(
        total_processed=total,
        new_reviews=new_count,
        updated_reviews=upd_count,
        collection_run_id=run_id,
        total_in_database=total_in_db,
    )

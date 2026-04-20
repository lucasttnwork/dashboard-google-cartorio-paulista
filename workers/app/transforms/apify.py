from __future__ import annotations

import json
from datetime import datetime, timezone

from app.settings import settings


def _parse_iso(value: str | None) -> datetime | None:
    """Parse ISO 8601 string to datetime, return None if invalid."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def transform_apify_review(raw: dict) -> dict:
    """Map Apify Google Maps Reviews Scraper JSON to DB columns."""
    return {
        "review_id": raw["reviewId"],
        "location_id": settings.location_id,
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
        "create_time": _parse_iso(raw.get("publishedAtDate")),
        "response_text": raw.get("responseFromOwnerText"),
        "response_time": _parse_iso(raw.get("responseFromOwnerDate")),
        "source": "apify",
        "raw_payload": json.dumps(raw),
    }

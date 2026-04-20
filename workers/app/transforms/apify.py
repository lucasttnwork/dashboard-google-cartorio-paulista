from __future__ import annotations

import json

from app.settings import settings


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
        "create_time": raw.get("publishedAtDate"),
        "response_text": raw.get("responseFromOwnerText"),
        "response_time": raw.get("responseFromOwnerDate"),
        "source": "apify",
        "raw_payload": json.dumps(raw),
    }

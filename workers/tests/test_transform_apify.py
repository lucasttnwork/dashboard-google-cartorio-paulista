"""Tests for workers/app/transforms/apify.py"""

from __future__ import annotations

import json
from unittest.mock import patch

from app.transforms.apify import transform_apify_review


FULL_RAW = {
    "reviewId": "abc123",
    "stars": 5,
    "text": "Excelente atendimento!",
    "name": "Maria Silva",
    "reviewerId": "user_456",
    "reviewerUrl": "https://maps.google.com/user/456",
    "reviewUrl": "https://maps.google.com/review/abc123",
    "isLocalGuide": True,
    "reviewerPhotoUrl": "https://photos.google.com/456.jpg",
    "originalLanguage": "pt",
    "textTranslated": "Excellent service!",
    "publishedAtDate": "2026-04-15T10:00:00Z",
    "responseFromOwnerText": "Obrigado!",
    "responseFromOwnerDate": "2026-04-16T08:00:00Z",
}


def test_transform_all_fields():
    result = transform_apify_review(FULL_RAW)

    assert result["review_id"] == "abc123"
    assert result["rating"] == 5
    assert result["comment"] == "Excelente atendimento!"
    assert result["reviewer_name"] == "Maria Silva"
    assert result["reviewer_id"] == "user_456"
    assert result["reviewer_url"] == "https://maps.google.com/user/456"
    assert result["review_url"] == "https://maps.google.com/review/abc123"
    assert result["is_local_guide"] is True
    assert result["reviewer_photo_url"] == "https://photos.google.com/456.jpg"
    assert result["original_language"] == "pt"
    assert result["translated_text"] == "Excellent service!"
    from datetime import datetime, timezone
    assert result["create_time"] == datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc)
    assert result["response_text"] == "Obrigado!"
    assert result["response_time"] == datetime(2026, 4, 16, 8, 0, tzinfo=timezone.utc)
    assert result["source"] == "apify"
    assert json.loads(result["raw_payload"]) == FULL_RAW


def test_transform_missing_optional_fields():
    minimal = {"reviewId": "min001"}
    result = transform_apify_review(minimal)

    assert result["review_id"] == "min001"
    assert result["rating"] is None
    assert result["comment"] is None
    assert result["reviewer_name"] is None
    assert result["reviewer_url"] is None
    assert result["is_local_guide"] is None
    assert result["response_text"] is None
    assert result["response_time"] is None
    assert result["source"] == "apify"


def test_transform_uses_settings_location_id():
    with patch("app.transforms.apify.settings") as mock_settings:
        mock_settings.location_id = "custom-location-123"
        result = transform_apify_review(FULL_RAW)
        assert result["location_id"] == "custom-location-123"


def test_transform_missing_review_id_raises():
    import pytest

    with pytest.raises(KeyError):
        transform_apify_review({"stars": 5, "text": "Good"})

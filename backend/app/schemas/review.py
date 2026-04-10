"""Pydantic schemas for /api/v1/reviews/* endpoints (Phase 3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MentionOut(BaseModel):
    """A single collaborator mention within a review."""

    model_config = ConfigDict(from_attributes=True)

    collaborator_id: int
    collaborator_name: str
    mention_snippet: str | None = None
    match_score: float | None = None


class ReviewOut(BaseModel):
    """Compact review representation for list endpoints."""

    model_config = ConfigDict(from_attributes=True)

    review_id: str
    location_id: str | None = None
    rating: int | None = None
    comment: str | None = None
    reviewer_name: str | None = None
    is_anonymous: bool | None = None
    create_time: datetime | None = None
    update_time: datetime | None = None
    reply_text: str | None = None
    reply_time: datetime | None = None
    review_url: str | None = None
    is_local_guide: bool | None = None

    # Denormalized from review_labels
    sentiment: str | None = None
    is_enotariado: bool | None = None

    # Denormalized from review_collaborators
    collaborator_names: list[str] = []


class ReviewDetailOut(ReviewOut):
    """Full review representation for single-review GET."""

    original_language: str | None = None
    translated_text: str | None = None
    response_text: str | None = None
    response_time: datetime | None = None
    reviewer_id: str | None = None
    reviewer_url: str | None = None
    reviewer_photo_url: str | None = None
    collection_source: str | None = None
    processed_at: datetime | None = None

    mentions: list[MentionOut] = []


class ReviewListResponse(BaseModel):
    """Paginated review list with cursor-based pagination."""

    items: list[ReviewOut]
    next_cursor: str | None = None
    has_more: bool
    total: int

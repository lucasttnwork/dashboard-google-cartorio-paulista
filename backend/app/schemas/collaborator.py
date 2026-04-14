"""Pydantic schemas for /api/v1/collaborators/* endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.metrics import CollaboratorMonthData


class CollaboratorCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list)
    department: str | None = "E-notariado"
    position: str | None = None


class CollaboratorUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    aliases: list[str] | None = None
    department: str | None = None
    position: str | None = None
    is_active: bool | None = None
    user_id: str | None = None  # UUID as string, nullable


class CollaboratorOut(BaseModel):
    id: int
    full_name: str
    aliases: list[str]
    department: str | None
    position: str | None
    is_active: bool
    user_id: str | None = None
    mention_count: int = 0
    created_at: datetime
    updated_at: datetime


class CollaboratorDetail(CollaboratorOut):
    """Extended response for single-collaborator GET."""
    pass


class CollaboratorListResponse(BaseModel):
    items: list[CollaboratorOut]
    total: int
    page: int
    page_size: int


class MergeRequest(BaseModel):
    source_id: int
    target_id: int


class MergeResponse(BaseModel):
    target_id: int
    mentions_transferred: int
    aliases_added: list[str]
    source_deactivated: bool


class CSVImportRow(BaseModel):
    row: int
    error: str


class CSVImportResponse(BaseModel):
    created: int
    updated: int
    errors: list[CSVImportRow]


class AuditLogOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    action: str
    actor_email: str
    diff: dict
    created_at: datetime


# ---------------------------------------------------------------------------
# Phase 3.7 — Collaborator profile page
# ---------------------------------------------------------------------------


class CollaboratorReviewOut(BaseModel):
    """A single review mentioning a collaborator, for the profile page table."""

    review_id: str
    rating: int | None
    comment: str | None
    reviewer_name: str
    create_time: str | None
    mention_snippet: str | None
    match_score: float | None


class CollaboratorProfileOut(BaseModel):
    """Full profile for a single collaborator.

    Aggregates historical KPIs, a 6-month rolling window vs. the previous
    6-month window (for frontend-side delta calculation), a rating
    distribution computed only over reviews that mention this collaborator,
    the last 12 months of monthly mention counts, and the 20 most recent
    reviews that mention them.
    """

    # --- Basic info ---------------------------------------------------------
    id: int
    full_name: str
    aliases: list[str]
    department: str | None
    position: str | None
    is_active: bool

    # --- All-time KPIs ------------------------------------------------------
    total_mentions: int
    avg_rating: float | None
    ranking: int | None
    total_collaborators_active: int

    # --- Windowed KPIs (delta baseline for the frontend) -------------------
    mentions_last_6m: int
    mentions_prev_6m: int
    avg_rating_last_6m: float | None
    avg_rating_prev_6m: float | None

    # --- Distribution, time series, reviews --------------------------------
    rating_distribution: dict[str, int] = Field(
        default_factory=lambda: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    )
    monthly: list[CollaboratorMonthData]
    recent_reviews: list[CollaboratorReviewOut]

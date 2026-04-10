"""Pydantic schemas for /api/v1/metrics/* endpoints (Phase 3)."""

from __future__ import annotations

from pydantic import BaseModel


class MetricsOverviewOut(BaseModel):
    """Aggregate KPIs for the dashboard header cards."""

    total_reviews: int
    avg_rating: float
    five_star_pct: float
    one_star_pct: float
    total_with_comment: int
    total_with_reply: int
    total_enotariado: int
    avg_rating_enotariado: float | None = None
    total_collaborators_active: int
    total_mentions: int
    period_start: str
    period_end: str


class MonthData(BaseModel):
    """Single month data point for the trends chart."""

    month: str
    total_reviews: int
    avg_rating: float
    reviews_enotariado: int
    avg_rating_enotariado: float | None = None


class TrendsOut(BaseModel):
    """Monthly trends over the selected period."""

    months: list[MonthData]


class CollaboratorMonthData(BaseModel):
    """Single month data point for a collaborator's mentions."""

    month: str
    mentions: int
    avg_rating: float | None = None


class CollaboratorMentionOut(BaseModel):
    """Aggregated mention statistics for one collaborator."""

    collaborator_id: int
    full_name: str
    is_active: bool
    total_mentions: int
    avg_rating_mentioned: float | None = None
    monthly: list[CollaboratorMonthData]


class CollaboratorMentionsOut(BaseModel):
    """Response wrapper for the collaborator mentions endpoint."""

    collaborators: list[CollaboratorMentionOut]

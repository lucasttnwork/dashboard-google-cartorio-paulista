"""Pydantic schemas for /api/v1/metrics/* endpoints (Phase 3)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PreviousPeriodOut(BaseModel):
    """Aggregate KPIs for the comparison period (same duration, shifted back).

    Returned alongside ``MetricsOverviewOut`` when ``compare_previous=True``
    is requested. Fields mirror the subset of ``MetricsOverviewOut`` that
    the frontend needs to compute deltas.
    """

    total_reviews: int
    avg_rating: float
    five_star_pct: float
    one_star_pct: float
    reply_rate_pct: float
    total_mentions: int
    period_start: str
    period_end: str


class MetricsOverviewOut(BaseModel):
    """Aggregate KPIs for the dashboard header cards."""

    total_reviews: int
    avg_rating: float
    five_star_pct: float
    one_star_pct: float
    total_with_comment: int
    total_with_reply: int
    reply_rate_pct: float = 0.0
    total_enotariado: int
    avg_rating_enotariado: float | None = None
    total_collaborators_active: int
    total_mentions: int
    rating_distribution: dict[str, int] = Field(
        default_factory=lambda: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    )
    period_start: str
    period_end: str
    previous_period: PreviousPeriodOut | None = None


class MonthData(BaseModel):
    """Single month data point for the trends chart."""

    month: str
    total_reviews: int
    avg_rating: float
    reviews_enotariado: int
    avg_rating_enotariado: float | None = None
    reply_rate_pct: float = 0.0


class DataStatusOut(BaseModel):
    """Data freshness indicator for the dashboard chrome."""

    last_review_date: str | None
    last_collection_run: str | None
    total_reviews: int
    days_since_last_review: int | None


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


class MyPerformanceOut(BaseModel):
    """Personal performance metrics for a linked collaborator."""

    linked: bool
    collaborator_id: int | None = None
    full_name: str | None = None
    total_mentions: int = 0
    avg_rating: float | None = None
    ranking: int | None = None
    total_collaborators: int = 0
    monthly: list[CollaboratorMonthData] = []
    recent_reviews: list[dict] = []

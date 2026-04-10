"""Metrics aggregation service for Phase 3 dashboard.

Provides overview KPIs, monthly trends, and per-collaborator mention
statistics.  All queries use service_role (RLS bypassed) and are read-only.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import structlog
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.collaborator import Collaborator, ReviewCollaborator
from app.db.models.review import Review, ReviewLabel
from app.schemas.metrics import (
    CollaboratorMentionOut,
    CollaboratorMentionsOut,
    CollaboratorMonthData,
    MetricsOverviewOut,
    MonthData,
    TrendsOut,
)

logger = structlog.get_logger(__name__)


def _parse_date(value: str | None) -> datetime | None:
    """Parse an ISO date string (YYYY-MM-DD) to a timezone-aware datetime."""
    if value is None:
        return None
    return datetime.combine(date.fromisoformat(value), datetime.min.time(), tzinfo=timezone.utc)


def _round2(value: float | None) -> float | None:
    """Round to 2 decimal places, returning None if the input is None."""
    if value is None:
        return None
    return round(float(value), 2)


# ---------------------------------------------------------------------------
# 1. Overview KPIs
# ---------------------------------------------------------------------------


async def get_overview(
    session: AsyncSession,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
) -> MetricsOverviewOut:
    """Compute aggregate KPIs from the reviews table (real-time)."""
    dt_from = _parse_date(date_from)
    dt_to = _parse_date(date_to)

    # --- Main aggregation over reviews + review_labels -----------------
    stmt = (
        select(
            func.count().label("total"),
            func.avg(Review.rating).label("avg_rating"),
            func.count().filter(Review.rating == 5).label("five_star"),
            func.count().filter(Review.rating == 1).label("one_star"),
            func.count().filter(
                (Review.comment.isnot(None)) & (Review.comment != "")
            ).label("with_comment"),
            func.count().filter(
                (Review.reply_text.isnot(None)) & (Review.reply_text != "")
            ).label("with_reply"),
            func.sum(
                case((ReviewLabel.is_enotariado.is_(True), 1), else_=0)
            ).label("enotariado"),
            func.avg(
                case((ReviewLabel.is_enotariado.is_(True), Review.rating), else_=None)
            ).label("avg_rating_enot"),
            func.min(Review.create_time).label("period_start"),
            func.max(Review.create_time).label("period_end"),
        )
        .select_from(Review)
        .outerjoin(ReviewLabel, Review.review_id == ReviewLabel.review_id)
    )

    if dt_from is not None:
        stmt = stmt.where(Review.create_time >= dt_from)
    if dt_to is not None:
        stmt = stmt.where(Review.create_time <= dt_to)

    row = (await session.execute(stmt)).one()

    total: int = row.total or 0

    # --- Collaborators active count ------------------------------------
    active_count = (
        await session.execute(
            select(func.count()).select_from(Collaborator).where(Collaborator.is_active.is_(True))
        )
    ).scalar() or 0

    # --- Total mentions count ------------------------------------------
    mentions_stmt = select(func.count()).select_from(ReviewCollaborator)
    # Apply same date filter to mentions via join to reviews
    if dt_from is not None or dt_to is not None:
        mentions_stmt = mentions_stmt.join(
            Review, ReviewCollaborator.review_id == Review.review_id
        )
        if dt_from is not None:
            mentions_stmt = mentions_stmt.where(Review.create_time >= dt_from)
        if dt_to is not None:
            mentions_stmt = mentions_stmt.where(Review.create_time <= dt_to)

    total_mentions = (await session.execute(mentions_stmt)).scalar() or 0

    # --- Build response ------------------------------------------------
    period_start = row.period_start or dt_from
    period_end = row.period_end or dt_to

    return MetricsOverviewOut(
        total_reviews=total,
        avg_rating=_round2(row.avg_rating) or 0.0,
        five_star_pct=_round2((row.five_star / total) * 100) if total > 0 else 0.0,
        one_star_pct=_round2((row.one_star / total) * 100) if total > 0 else 0.0,
        total_with_comment=row.with_comment or 0,
        total_with_reply=row.with_reply or 0,
        total_enotariado=row.enotariado or 0,
        avg_rating_enotariado=_round2(row.avg_rating_enot),
        total_collaborators_active=active_count,
        total_mentions=total_mentions,
        period_start=period_start.isoformat() if isinstance(period_start, datetime) else (period_start or ""),
        period_end=period_end.isoformat() if isinstance(period_end, datetime) else (period_end or ""),
    )


# ---------------------------------------------------------------------------
# 2. Monthly trends
# ---------------------------------------------------------------------------


async def get_trends(
    session: AsyncSession,
    *,
    months: int = 12,
    location_id: str | None = None,
) -> TrendsOut:
    """Return monthly aggregated trends.

    Uses a live ``GROUP BY`` query for accuracy.  The ``mv_monthly``
    materialized view is not used because it may be stale (no automatic
    refresh until Phase 4 adds an arq task for it).
    """
    data: list[MonthData] = []

    # --- Live GROUP BY (always used) -----------------------------------
    fallback_sql = text(
        "SELECT date_trunc('month', r.create_time) AS month, "
        "       COUNT(*) AS total_reviews, "
        "       ROUND(AVG(r.rating)::numeric, 2) AS avg_rating, "
        "       SUM(CASE WHEN rl.is_enotariado THEN 1 ELSE 0 END) AS reviews_enotariado, "
        "       ROUND(AVG(CASE WHEN rl.is_enotariado THEN r.rating END)::numeric, 2) "
        "           AS avg_rating_enotariado "
        "FROM reviews r "
        "LEFT JOIN review_labels rl USING (review_id) "
        "WHERE r.create_time >= current_date - interval '1 month' * :months "
        + ("AND r.location_id = :loc " if location_id else "")
        + "GROUP BY 1 ORDER BY 1"
    )
    params = {"months": months}
    if location_id:
        params["loc"] = location_id

    result = await session.execute(fallback_sql, params)
    rows = result.all()

    for r in rows:
        data.append(
            MonthData(
                month=r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]),
                total_reviews=int(r[1]),
                avg_rating=_round2(r[2]) or 0.0,
                reviews_enotariado=int(r[3] or 0),
                avg_rating_enotariado=_round2(r[4]),
            )
        )

    logger.debug("metrics.trends.fallback", count=len(data))
    return TrendsOut(months=data)


# ---------------------------------------------------------------------------
# 3. Collaborator mentions breakdown
# ---------------------------------------------------------------------------


async def get_collaborator_mentions(
    session: AsyncSession,
    *,
    months: int = 12,
    include_inactive: bool = False,
) -> CollaboratorMentionsOut:
    """Per-collaborator mention counts with monthly breakdown."""
    cutoff = text("current_date - interval '1 month' * :months")

    # --- Aggregated totals per collaborator ----------------------------
    totals_stmt = (
        select(
            Collaborator.id,
            Collaborator.full_name,
            Collaborator.is_active,
            func.count(ReviewCollaborator.review_id).label("total_mentions"),
            func.avg(Review.rating).label("avg_rating"),
        )
        .join(ReviewCollaborator, ReviewCollaborator.collaborator_id == Collaborator.id)
        .join(Review, Review.review_id == ReviewCollaborator.review_id)
        .where(Review.create_time >= cutoff)
    )
    if not include_inactive:
        totals_stmt = totals_stmt.where(Collaborator.is_active.is_(True))
    totals_stmt = totals_stmt.group_by(Collaborator.id).order_by(
        func.count(ReviewCollaborator.review_id).desc()
    )

    totals_rows = (await session.execute(totals_stmt, {"months": months})).all()

    if not totals_rows:
        return CollaboratorMentionsOut(collaborators=[])

    collab_ids = [r[0] for r in totals_rows]

    # --- Monthly breakdown per collaborator ----------------------------
    monthly_stmt = (
        select(
            ReviewCollaborator.collaborator_id,
            func.date_trunc("month", Review.create_time).label("month"),
            func.count(ReviewCollaborator.review_id).label("mentions"),
            func.avg(Review.rating).label("avg_rating"),
        )
        .join(Review, Review.review_id == ReviewCollaborator.review_id)
        .where(
            ReviewCollaborator.collaborator_id.in_(collab_ids),
            Review.create_time >= cutoff,
        )
        .group_by(ReviewCollaborator.collaborator_id, text("2"))
        .order_by(ReviewCollaborator.collaborator_id, text("2"))
    )

    monthly_rows = (await session.execute(monthly_stmt, {"months": months})).all()

    # Index monthly data by collaborator_id
    monthly_map: dict[int, list[CollaboratorMonthData]] = {}
    for r in monthly_rows:
        cid = r[0]
        monthly_map.setdefault(cid, []).append(
            CollaboratorMonthData(
                month=r[1].isoformat() if hasattr(r[1], "isoformat") else str(r[1]),
                mentions=int(r[2]),
                avg_rating=_round2(r[3]),
            )
        )

    # --- Assemble response ---------------------------------------------
    collaborators: list[CollaboratorMentionOut] = []
    for r in totals_rows:
        cid = r[0]
        collaborators.append(
            CollaboratorMentionOut(
                collaborator_id=cid,
                full_name=r[1],
                is_active=r[2],
                total_mentions=int(r[3]),
                avg_rating_mentioned=_round2(r[4]),
                monthly=monthly_map.get(cid, []),
            )
        )

    return CollaboratorMentionsOut(collaborators=collaborators)

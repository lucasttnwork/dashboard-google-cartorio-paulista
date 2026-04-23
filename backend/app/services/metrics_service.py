"""Metrics aggregation service for Phase 3 dashboard.

Provides overview KPIs, monthly trends, and per-collaborator mention
statistics.  All queries use service_role (RLS bypassed) and are read-only.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import structlog
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.collaborator import Collaborator, ReviewCollaborator
from app.db.models.review import Review, ReviewLabel
from app.schemas.collaborator import (
    CollaboratorProfileOut,
    CollaboratorReviewOut,
)
from app.schemas.metrics import (
    CollaboratorMentionOut,
    CollaboratorMentionsOut,
    CollaboratorMonthData,
    DataStatusOut,
    MetricsOverviewOut,
    MonthData,
    MyPerformanceOut,
    PreviousPeriodOut,
    TrendsOut,
)

logger = structlog.get_logger(__name__)


def _parse_date(value: str | None) -> datetime | None:
    """Parse an ISO date string (YYYY-MM-DD) to UTC midnight.

    Used as the lower bound of a window — paired with `>=` SQL comparison.
    """
    if value is None:
        return None
    return datetime.combine(date.fromisoformat(value), datetime.min.time(), tzinfo=timezone.utc)


def _parse_date_to_exclusive(value: str | None) -> datetime | None:
    """Parse an ISO date string (YYYY-MM-DD) to UTC midnight of the NEXT day.

    Used as the upper bound of a window — paired with `<` (exclusive) SQL
    comparison so the entire UTC day named by `value` is included. Without
    this, `Review.create_time <= midnight` excludes every review of that day
    except those stamped at exactly 00:00:00 UTC, which silently hides today's
    reviews while the cron is still scraping them.
    """
    if value is None:
        return None
    return datetime.combine(
        date.fromisoformat(value) + timedelta(days=1),
        datetime.min.time(),
        tzinfo=timezone.utc,
    )


def _round2(value: float | None) -> float | None:
    """Round to 2 decimal places, returning None if the input is None."""
    if value is None:
        return None
    return round(float(value), 2)


# ---------------------------------------------------------------------------
# 1. Overview KPIs
# ---------------------------------------------------------------------------


async def _aggregate_overview_window(
    session: AsyncSession,
    *,
    dt_from: datetime | None,
    dt_to: datetime | None,
) -> dict:
    """Run the overview aggregation for a single window.

    Returns a dict with the raw aggregate values for the given window.
    Used by ``get_overview`` for both the primary window and the optional
    previous-period comparison window.
    """
    stmt = (
        select(
            func.count().label("total"),
            func.avg(Review.rating).label("avg_rating"),
            func.count().filter(Review.rating == 5).label("five_star"),
            func.count().filter(Review.rating == 4).label("four_star"),
            func.count().filter(Review.rating == 3).label("three_star"),
            func.count().filter(Review.rating == 2).label("two_star"),
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
        stmt = stmt.where(Review.create_time < dt_to)

    row = (await session.execute(stmt)).one()
    total = row.total or 0

    # Mentions count for the same window
    mentions_stmt = select(func.count()).select_from(ReviewCollaborator)
    if dt_from is not None or dt_to is not None:
        mentions_stmt = mentions_stmt.join(
            Review, ReviewCollaborator.review_id == Review.review_id
        )
        if dt_from is not None:
            mentions_stmt = mentions_stmt.where(Review.create_time >= dt_from)
        if dt_to is not None:
            mentions_stmt = mentions_stmt.where(Review.create_time < dt_to)
    total_mentions = (await session.execute(mentions_stmt)).scalar() or 0

    five_star_pct = round((row.five_star / total) * 100, 2) if total > 0 else 0.0
    one_star_pct = round((row.one_star / total) * 100, 2) if total > 0 else 0.0
    reply_rate_pct = (
        round(((row.with_reply or 0) / total) * 100, 2) if total > 0 else 0.0
    )

    rating_distribution: dict[str, int] = {
        "1": int(row.one_star or 0),
        "2": int(row.two_star or 0),
        "3": int(row.three_star or 0),
        "4": int(row.four_star or 0),
        "5": int(row.five_star or 0),
    }

    return {
        "total": int(total),
        "avg_rating": _round2(row.avg_rating) or 0.0,
        "five_star_pct": five_star_pct,
        "one_star_pct": one_star_pct,
        "with_comment": int(row.with_comment or 0),
        "with_reply": int(row.with_reply or 0),
        "reply_rate_pct": reply_rate_pct,
        "enotariado": int(row.enotariado or 0),
        "avg_rating_enot": _round2(row.avg_rating_enot),
        "total_mentions": int(total_mentions),
        "rating_distribution": rating_distribution,
        "period_start_raw": row.period_start,
        "period_end_raw": row.period_end,
    }


def _format_period_value(
    db_value: datetime | None, fallback: datetime | None
) -> str:
    value = db_value or fallback
    if isinstance(value, datetime):
        return value.isoformat()
    return value or ""


async def get_overview(
    session: AsyncSession,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    compare_previous: bool = False,
) -> MetricsOverviewOut:
    """Compute aggregate KPIs from the reviews table (real-time).

    When *compare_previous* is True and both ``date_from``/``date_to`` are
    provided, also computes the same aggregation for the window of equal
    duration immediately preceding the primary window, returned as
    ``previous_period``. Missing either boundary yields ``previous_period=None``.
    """
    dt_from = _parse_date(date_from)
    dt_to = _parse_date_to_exclusive(date_to)

    primary = await _aggregate_overview_window(
        session, dt_from=dt_from, dt_to=dt_to
    )

    # --- Collaborators active count (not window-dependent) ------------
    active_count = (
        await session.execute(
            select(func.count()).select_from(Collaborator).where(Collaborator.is_active.is_(True))
        )
    ).scalar() or 0

    # --- Optional previous-period aggregation -------------------------
    previous_period: PreviousPeriodOut | None = None
    if compare_previous and dt_from is not None and dt_to is not None:
        duration = dt_to - dt_from
        dt_prev_to = dt_from
        dt_prev_from = dt_from - duration
        prev = await _aggregate_overview_window(
            session, dt_from=dt_prev_from, dt_to=dt_prev_to
        )
        previous_period = PreviousPeriodOut(
            total_reviews=prev["total"],
            avg_rating=prev["avg_rating"],
            five_star_pct=prev["five_star_pct"],
            one_star_pct=prev["one_star_pct"],
            reply_rate_pct=prev["reply_rate_pct"],
            total_mentions=prev["total_mentions"],
            period_start=dt_prev_from.isoformat(),
            period_end=dt_prev_to.isoformat(),
        )

    return MetricsOverviewOut(
        total_reviews=primary["total"],
        avg_rating=primary["avg_rating"],
        five_star_pct=primary["five_star_pct"],
        one_star_pct=primary["one_star_pct"],
        total_with_comment=primary["with_comment"],
        total_with_reply=primary["with_reply"],
        reply_rate_pct=primary["reply_rate_pct"],
        total_enotariado=primary["enotariado"],
        avg_rating_enotariado=primary["avg_rating_enot"],
        total_collaborators_active=active_count,
        total_mentions=primary["total_mentions"],
        rating_distribution=primary["rating_distribution"],
        period_start=_format_period_value(primary["period_start_raw"], dt_from),
        period_end=_format_period_value(primary["period_end_raw"], dt_to),
        previous_period=previous_period,
    )


# ---------------------------------------------------------------------------
# 2. Monthly trends
# ---------------------------------------------------------------------------


async def get_trends(
    session: AsyncSession,
    *,
    months: int = 12,
    location_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    granularity: str = "month",
) -> TrendsOut:
    """Return aggregated trends bucketed by month or day.

    Window selection:
    - When ``date_from`` and/or ``date_to`` are provided, they override
      ``months`` and bound the window via inclusive ``BETWEEN``.
    - Otherwise the legacy relative window ``current_date - :months`` is used.

    When ``granularity="day"``, rows are grouped by
    ``date_trunc('day', create_time)`` and the value lands in
    ``MonthData.day`` instead of ``MonthData.month``.
    """
    bucket_unit = "day" if granularity == "day" else "month"
    use_range = date_from is not None or date_to is not None

    where_parts: list[str] = []
    params: dict[str, object] = {}

    if use_range:
        dt_from = _parse_date(date_from)
        dt_to = _parse_date_to_exclusive(date_to)
        if dt_from is not None:
            where_parts.append("r.create_time >= :dt_from")
            params["dt_from"] = dt_from
        if dt_to is not None:
            where_parts.append("r.create_time < :dt_to")
            params["dt_to"] = dt_to
    else:
        where_parts.append(
            "r.create_time >= current_date - interval '1 month' * :months"
        )
        params["months"] = months

    if location_id:
        where_parts.append("r.location_id = :loc")
        params["loc"] = location_id

    where_sql = " AND ".join(where_parts)

    sql = text(
        f"SELECT date_trunc('{bucket_unit}', r.create_time) AS bucket, "
        "       COUNT(*) AS total_reviews, "
        "       ROUND(AVG(r.rating)::numeric, 2) AS avg_rating, "
        "       SUM(CASE WHEN rl.is_enotariado THEN 1 ELSE 0 END) AS reviews_enotariado, "
        "       ROUND(AVG(CASE WHEN rl.is_enotariado THEN r.rating END)::numeric, 2) "
        "           AS avg_rating_enotariado, "
        "       ROUND(COUNT(*) FILTER (WHERE r.reply_text IS NOT NULL AND r.reply_text <> '')::numeric "
        "             * 100 / NULLIF(COUNT(*), 0), 2) AS reply_rate_pct "
        "FROM reviews r "
        "LEFT JOIN review_labels rl USING (review_id) "
        f"WHERE {where_sql} "
        "GROUP BY 1 ORDER BY 1"
    )

    result = await session.execute(sql, params)
    rows = result.all()

    data: list[MonthData] = []
    for r in rows:
        bucket_value = (
            r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0])
        )
        item_kwargs: dict[str, object] = {
            "total_reviews": int(r[1]),
            "avg_rating": _round2(r[2]) or 0.0,
            "reviews_enotariado": int(r[3] or 0),
            "avg_rating_enotariado": _round2(r[4]),
            "reply_rate_pct": float(r[5]) if r[5] is not None else 0.0,
        }
        if granularity == "day":
            item_kwargs["day"] = bucket_value
        else:
            item_kwargs["month"] = bucket_value
        data.append(MonthData(**item_kwargs))

    logger.debug(
        "metrics.trends", count=len(data), granularity=granularity, use_range=use_range
    )
    return TrendsOut(months=data, granularity=granularity)


# ---------------------------------------------------------------------------
# 3. Collaborator mentions breakdown
# ---------------------------------------------------------------------------


async def get_collaborator_mentions(
    session: AsyncSession,
    *,
    months: int = 12,
    include_inactive: bool = False,
    date_from: str | None = None,
    date_to: str | None = None,
) -> CollaboratorMentionsOut:
    """Per-collaborator mention counts with monthly breakdown.

    When ``date_from`` and/or ``date_to`` are provided they override the
    relative ``months`` window and bound the filter via inclusive
    ``BETWEEN``. The temporal filter is applied to BOTH the totals query
    and the ``monthly[]`` sub-aggregation so that short windows report
    counts restricted to the requested range.
    """
    use_range = date_from is not None or date_to is not None
    dt_from = _parse_date(date_from) if use_range else None
    dt_to = _parse_date_to_exclusive(date_to) if use_range else None

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
    )

    exec_params: dict[str, object] = {}
    if use_range:
        if dt_from is not None:
            totals_stmt = totals_stmt.where(Review.create_time >= dt_from)
        if dt_to is not None:
            totals_stmt = totals_stmt.where(Review.create_time < dt_to)
    else:
        cutoff = text("current_date - interval '1 month' * :months")
        totals_stmt = totals_stmt.where(Review.create_time >= cutoff)
        exec_params["months"] = months

    if not include_inactive:
        totals_stmt = totals_stmt.where(Collaborator.is_active.is_(True))
    totals_stmt = totals_stmt.group_by(Collaborator.id).order_by(
        func.count(ReviewCollaborator.review_id).desc()
    )

    totals_rows = (await session.execute(totals_stmt, exec_params)).all()

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
        .where(ReviewCollaborator.collaborator_id.in_(collab_ids))
    )
    if use_range:
        if dt_from is not None:
            monthly_stmt = monthly_stmt.where(Review.create_time >= dt_from)
        if dt_to is not None:
            monthly_stmt = monthly_stmt.where(Review.create_time < dt_to)
    else:
        cutoff = text("current_date - interval '1 month' * :months")
        monthly_stmt = monthly_stmt.where(Review.create_time >= cutoff)

    monthly_stmt = monthly_stmt.group_by(
        ReviewCollaborator.collaborator_id, text("2")
    ).order_by(ReviewCollaborator.collaborator_id, text("2"))

    monthly_rows = (await session.execute(monthly_stmt, exec_params)).all()

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


# ---------------------------------------------------------------------------
# 4. My performance (for linked collaborator)
# ---------------------------------------------------------------------------


async def get_my_performance(
    session: AsyncSession,
    *,
    user_id: str,
) -> MyPerformanceOut:
    """Return performance metrics for the collaborator linked to *user_id*."""
    from uuid import UUID as _UUID

    # ``user_id`` may arrive as a native asyncpg UUID, a stdlib UUID, or a
    # plain string; normalise via ``str()`` before reconstructing to avoid
    # ``AttributeError`` inside the stdlib UUID constructor.
    uid = _UUID(str(user_id))

    # Find linked collaborator
    collab_row = (
        await session.execute(
            select(Collaborator.id, Collaborator.full_name)
            .where(Collaborator.user_id == uid)
        )
    ).one_or_none()

    if collab_row is None:
        return MyPerformanceOut(linked=False)

    cid, full_name = collab_row[0], collab_row[1]

    # Total mentions + avg rating
    stats = (
        await session.execute(
            select(
                func.count(ReviewCollaborator.review_id),
                func.avg(Review.rating),
            )
            .join(Review, Review.review_id == ReviewCollaborator.review_id)
            .where(ReviewCollaborator.collaborator_id == cid)
        )
    ).one()
    total_mentions = int(stats[0] or 0)
    avg_rating = _round2(stats[1])

    # Ranking among active collaborators
    ranking_stmt = (
        select(
            ReviewCollaborator.collaborator_id,
            func.count(ReviewCollaborator.review_id).label("cnt"),
        )
        .join(Collaborator, Collaborator.id == ReviewCollaborator.collaborator_id)
        .where(Collaborator.is_active.is_(True))
        .group_by(ReviewCollaborator.collaborator_id)
        .order_by(func.count(ReviewCollaborator.review_id).desc())
    )
    ranking_rows = (await session.execute(ranking_stmt)).all()
    total_collaborators = len(ranking_rows)
    ranking = next(
        (i + 1 for i, r in enumerate(ranking_rows) if r[0] == cid),
        None,
    )

    # Monthly breakdown (last 12 months)
    cutoff = text("current_date - interval '12 months'")
    monthly_stmt = (
        select(
            func.date_trunc("month", Review.create_time).label("month"),
            func.count(ReviewCollaborator.review_id).label("mentions"),
            func.avg(Review.rating).label("avg_rating"),
        )
        .join(Review, Review.review_id == ReviewCollaborator.review_id)
        .where(
            ReviewCollaborator.collaborator_id == cid,
            Review.create_time >= cutoff,
        )
        .group_by(text("1"))
        .order_by(text("1"))
    )
    monthly_rows = (await session.execute(monthly_stmt)).all()
    monthly = [
        CollaboratorMonthData(
            month=r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]),
            mentions=int(r[1]),
            avg_rating=_round2(r[2]),
        )
        for r in monthly_rows
    ]

    # Recent reviews mentioning this collaborator (last 10)
    recent_stmt = (
        select(
            Review.review_id,
            Review.rating,
            Review.comment,
            Review.reviewer_name,
            Review.create_time,
        )
        .join(ReviewCollaborator, ReviewCollaborator.review_id == Review.review_id)
        .where(ReviewCollaborator.collaborator_id == cid)
        .order_by(Review.create_time.desc())
        .limit(10)
    )
    recent_rows = (await session.execute(recent_stmt)).all()
    recent_reviews = [
        {
            "review_id": r[0],
            "rating": r[1],
            "comment": (r[2] or "")[:200],
            "reviewer_name": r[3] or "Anônimo",
            "create_time": r[4].isoformat() if r[4] else None,
        }
        for r in recent_rows
    ]

    return MyPerformanceOut(
        linked=True,
        collaborator_id=cid,
        full_name=full_name,
        total_mentions=total_mentions,
        avg_rating=avg_rating,
        ranking=ranking,
        total_collaborators=total_collaborators,
        monthly=monthly,
        recent_reviews=recent_reviews,
    )


# ---------------------------------------------------------------------------
# 5. Collaborator profile page (Phase 3.7)
# ---------------------------------------------------------------------------


async def get_collaborator_profile(
    session: AsyncSession,
    collaborator_id: int,
) -> CollaboratorProfileOut | None:
    """Aggregated profile for a single collaborator.

    Returns ``None`` when no collaborator exists with the given id so the
    route can emit a 404. Performs a handful of small, independent queries
    instead of one monster join — each one is cheap on the indexed tables.
    """
    # --- Basic info ----------------------------------------------------
    basic_row = (
        await session.execute(
            select(
                Collaborator.id,
                Collaborator.full_name,
                Collaborator.aliases,
                Collaborator.department,
                Collaborator.position,
                Collaborator.is_active,
            ).where(Collaborator.id == collaborator_id)
        )
    ).one_or_none()

    if basic_row is None:
        return None

    cid = basic_row[0]

    # --- All-time totals + rating distribution ------------------------
    totals_stmt = (
        select(
            func.count(ReviewCollaborator.review_id).label("total_mentions"),
            func.avg(Review.rating).label("avg_rating"),
            func.count().filter(Review.rating == 1).label("r1"),
            func.count().filter(Review.rating == 2).label("r2"),
            func.count().filter(Review.rating == 3).label("r3"),
            func.count().filter(Review.rating == 4).label("r4"),
            func.count().filter(Review.rating == 5).label("r5"),
        )
        .select_from(ReviewCollaborator)
        .join(Review, Review.review_id == ReviewCollaborator.review_id)
        .where(ReviewCollaborator.collaborator_id == cid)
    )
    totals_row = (await session.execute(totals_stmt)).one()
    total_mentions = int(totals_row.total_mentions or 0)
    avg_rating = _round2(totals_row.avg_rating)
    rating_distribution = {
        "1": int(totals_row.r1 or 0),
        "2": int(totals_row.r2 or 0),
        "3": int(totals_row.r3 or 0),
        "4": int(totals_row.r4 or 0),
        "5": int(totals_row.r5 or 0),
    }

    # --- Ranking among active collaborators ---------------------------
    ranking_stmt = (
        select(
            ReviewCollaborator.collaborator_id,
            func.count(ReviewCollaborator.review_id).label("cnt"),
        )
        .join(Collaborator, Collaborator.id == ReviewCollaborator.collaborator_id)
        .where(Collaborator.is_active.is_(True))
        .group_by(ReviewCollaborator.collaborator_id)
        .order_by(func.count(ReviewCollaborator.review_id).desc())
    )
    ranking_rows = (await session.execute(ranking_stmt)).all()
    total_collaborators_active = (
        await session.execute(
            select(func.count())
            .select_from(Collaborator)
            .where(Collaborator.is_active.is_(True))
        )
    ).scalar() or 0

    ranking = next(
        (i + 1 for i, r in enumerate(ranking_rows) if r[0] == cid),
        None,
    )

    # --- 6m / prev 6m windows (for frontend delta) --------------------
    # Use the review with the latest create_time the collaborator is
    # mentioned on as the anchor so the window works even on stale DBs.
    # Fallback to "now" when there are no mentions at all.
    anchor_row = (
        await session.execute(
            select(func.max(Review.create_time))
            .select_from(ReviewCollaborator)
            .join(Review, Review.review_id == ReviewCollaborator.review_id)
            .where(ReviewCollaborator.collaborator_id == cid)
        )
    ).scalar()
    anchor_raw = anchor_row or datetime.now(tz=timezone.utc)
    if isinstance(anchor_raw, datetime) and anchor_raw.tzinfo is None:
        anchor_raw = anchor_raw.replace(tzinfo=timezone.utc)
    anchor: datetime = anchor_raw

    six_months = timedelta(days=183)
    window_a_from = anchor - six_months
    window_b_from = anchor - (six_months * 2)

    def _window_stmt(start: datetime, end: datetime):
        return (
            select(
                func.count(ReviewCollaborator.review_id),
                func.avg(Review.rating),
            )
            .select_from(ReviewCollaborator)
            .join(Review, Review.review_id == ReviewCollaborator.review_id)
            .where(
                ReviewCollaborator.collaborator_id == cid,
                Review.create_time >= start,
                Review.create_time < end,
            )
        )

    last_row = (
        await session.execute(_window_stmt(window_a_from, anchor))
    ).one()
    prev_row = (
        await session.execute(_window_stmt(window_b_from, window_a_from))
    ).one()

    mentions_last_6m = int(last_row[0] or 0)
    avg_rating_last_6m = _round2(last_row[1])
    mentions_prev_6m = int(prev_row[0] or 0)
    avg_rating_prev_6m = _round2(prev_row[1])

    # --- Monthly breakdown (last 12 months) ---------------------------
    cutoff_sql = text("current_date - interval '12 months'")
    try:
        monthly_stmt = (
            select(
                func.date_trunc("month", Review.create_time).label("month"),
                func.count(ReviewCollaborator.review_id).label("mentions"),
                func.avg(Review.rating).label("avg_rating"),
            )
            .join(Review, Review.review_id == ReviewCollaborator.review_id)
            .where(
                ReviewCollaborator.collaborator_id == cid,
                Review.create_time >= cutoff_sql,
            )
            .group_by(text("1"))
            .order_by(text("1"))
        )
        monthly_rows = (await session.execute(monthly_stmt)).all()
    except Exception:  # pragma: no cover — SQLite test fallback
        monthly_rows = []

    monthly = [
        CollaboratorMonthData(
            month=r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]),
            mentions=int(r[1]),
            avg_rating=_round2(r[2]),
        )
        for r in monthly_rows
    ]

    # --- Recent reviews (last 20) -------------------------------------
    recent_stmt = (
        select(
            Review.review_id,
            Review.rating,
            Review.comment,
            Review.reviewer_name,
            Review.create_time,
            ReviewCollaborator.mention_snippet,
            ReviewCollaborator.match_score,
        )
        .select_from(ReviewCollaborator)
        .join(Review, Review.review_id == ReviewCollaborator.review_id)
        .where(ReviewCollaborator.collaborator_id == cid)
        .order_by(Review.create_time.desc())
        .limit(20)
    )
    recent_rows = (await session.execute(recent_stmt)).all()
    recent_reviews = [
        CollaboratorReviewOut(
            review_id=r[0],
            rating=r[1],
            comment=(r[2] or "")[:300] if r[2] is not None else None,
            reviewer_name=r[3] or "Anônimo",
            create_time=r[4].isoformat() if r[4] else None,
            mention_snippet=r[5],
            match_score=r[6],
        )
        for r in recent_rows
    ]

    return CollaboratorProfileOut(
        id=cid,
        full_name=basic_row[1],
        aliases=list(basic_row[2] or []),
        department=basic_row[3],
        position=basic_row[4],
        is_active=bool(basic_row[5]),
        total_mentions=total_mentions,
        avg_rating=avg_rating,
        ranking=ranking,
        total_collaborators_active=int(total_collaborators_active),
        mentions_last_6m=mentions_last_6m,
        mentions_prev_6m=mentions_prev_6m,
        avg_rating_last_6m=avg_rating_last_6m,
        avg_rating_prev_6m=avg_rating_prev_6m,
        rating_distribution=rating_distribution,
        monthly=monthly,
        recent_reviews=recent_reviews,
    )


# ---------------------------------------------------------------------------
# 6. Data freshness status (Phase 3.7)
# ---------------------------------------------------------------------------


async def get_data_status(session: AsyncSession) -> DataStatusOut:
    """Expose data freshness indicators for the dashboard chrome.

    Reads the max ``create_time`` from ``reviews``, the max ``completed_at``
    from ``collection_runs`` with status ``completed``, and the total review
    count. Computes ``days_since_last_review`` server-side so the frontend
    does not need to parse dates for the gray/amber/red threshold.
    """
    last_review_row = (
        await session.execute(select(func.max(Review.create_time)))
    ).scalar()

    total_reviews = (
        await session.execute(select(func.count()).select_from(Review))
    ).scalar() or 0

    try:
        last_run_row = (
            await session.execute(
                text(
                    "SELECT MAX(completed_at) FROM collection_runs "
                    "WHERE status = 'completed'"
                )
            )
        ).scalar()
    except Exception:  # pragma: no cover — SQLite fallback when table absent
        last_run_row = None

    days_since_last_review: int | None = None
    if isinstance(last_review_row, datetime):
        now = datetime.now(tz=timezone.utc)
        # ensure tz-aware arithmetic
        anchor = last_review_row
        if anchor.tzinfo is None:
            anchor = anchor.replace(tzinfo=timezone.utc)
        delta = now - anchor
        days_since_last_review = max(0, delta.days)

    def _iso(value: object) -> str | None:
        if isinstance(value, datetime):
            return value.isoformat()
        if value is None:
            return None
        return str(value)

    return DataStatusOut(
        last_review_date=_iso(last_review_row),
        last_collection_run=_iso(last_run_row),
        total_reviews=int(total_reviews),
        days_since_last_review=days_since_last_review,
    )

"""Review query service (read-only).

Cursor-based pagination over reviews with optional filters (rating,
search, date range) and eager-loaded labels + collaborator mentions.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime

import structlog
from sqlalchemy import Select, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.db.models.collaborator import Collaborator, ReviewCollaborator
from app.db.models.review import Review, ReviewLabel
from app.schemas.review import (
    MentionOut,
    ReviewDetailOut,
    ReviewListResponse,
    ReviewOut,
)

logger = structlog.get_logger(__name__)

SortColumn = str  # "create_time" | "rating"
SortOrder = str  # "asc" | "desc"


# ---------------------------------------------------------------------------
# Cursor helpers
# ---------------------------------------------------------------------------

def _encode_cursor(create_time: datetime, review_id: str) -> str:
    payload = json.dumps({"t": create_time.isoformat(), "id": review_id})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    data = json.loads(base64.urlsafe_b64decode(cursor))
    return datetime.fromisoformat(data["t"]), data["id"]


# ---------------------------------------------------------------------------
# ORM → Schema helpers
# ---------------------------------------------------------------------------

def _review_to_out(
    review: Review,
    collab_names: dict[int, str],
) -> ReviewOut:
    return ReviewOut(
        review_id=review.review_id,
        location_id=review.location_id,
        rating=review.rating,
        comment=review.comment,
        reviewer_name=review.reviewer_name,
        is_anonymous=review.is_anonymous,
        create_time=review.create_time,
        update_time=review.update_time,
        reply_text=review.reply_text,
        reply_time=review.reply_time,
        review_url=review.review_url,
        is_local_guide=review.is_local_guide,
        sentiment=review.label.sentiment if review.label else None,
        is_enotariado=review.label.is_enotariado if review.label else None,
        collaborator_names=[
            collab_names.get(m.collaborator_id, "?")
            for m in (review.mentions or [])
        ],
    )


def _review_to_detail(
    review: Review,
    collab_names: dict[int, str],
) -> ReviewDetailOut:
    base = _review_to_out(review, collab_names)
    return ReviewDetailOut(
        **base.model_dump(),
        original_language=review.original_language,
        translated_text=review.translated_text,
        response_text=review.response_text,
        response_time=review.response_time,
        reviewer_id=review.reviewer_id,
        reviewer_url=review.reviewer_url,
        reviewer_photo_url=review.reviewer_photo_url,
        collection_source=review.collection_source,
        processed_at=review.processed_at,
        mentions=[
            MentionOut(
                collaborator_id=m.collaborator_id,
                collaborator_name=collab_names.get(m.collaborator_id, "?"),
                mention_snippet=m.mention_snippet,
                match_score=m.match_score,
            )
            for m in (review.mentions or [])
        ],
    )


async def _load_collab_names(
    session: AsyncSession,
    reviews: list[Review],
) -> dict[int, str]:
    """Batch-load collaborator full_names for all mentions in *reviews*."""
    collab_ids: set[int] = set()
    for r in reviews:
        for m in r.mentions or []:
            collab_ids.add(m.collaborator_id)
    if not collab_ids:
        return {}
    rows = (
        await session.execute(
            select(Collaborator.id, Collaborator.full_name).where(
                Collaborator.id.in_(collab_ids)
            )
        )
    ).all()
    return {row[0]: row[1] for row in rows}


# ---------------------------------------------------------------------------
# Filter builder
# ---------------------------------------------------------------------------

def _apply_filters(
    stmt: Select,
    *,
    rating: int | None,
    search: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    has_reply: bool | None = None,
) -> Select:
    if rating is not None:
        stmt = stmt.where(Review.rating == rating)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Review.comment.ilike(pattern),
                Review.reviewer_name.ilike(pattern),
            )
        )
    if date_from is not None:
        stmt = stmt.where(Review.create_time >= date_from)
    if date_to is not None:
        stmt = stmt.where(Review.create_time <= date_to)
    if has_reply is True:
        stmt = stmt.where(Review.reply_text.isnot(None))
    elif has_reply is False:
        stmt = stmt.where(Review.reply_text.is_(None))
    return stmt


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def list_reviews(
    session: AsyncSession,
    *,
    cursor: str | None = None,
    limit: int = 50,
    rating: int | None = None,
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    has_reply: bool | None = None,
    sort_by: str = "create_time",
    sort_order: str = "desc",
) -> ReviewListResponse:
    """Return a cursor-paginated list of reviews with filters.

    The cursor is a base64-encoded ``{"t": <ISO timestamp>, "id": <review_id>}``
    composite key.  The first page also computes the total matching count.
    """
    # --- Total count (first page only) ---
    total = 0
    if cursor is None:
        count_stmt: Select = select(func.count()).select_from(Review)
        count_stmt = _apply_filters(
            count_stmt, rating=rating, search=search,
            date_from=date_from, date_to=date_to, has_reply=has_reply,
        )
        total = (await session.execute(count_stmt)).scalar() or 0

    # --- Main query ---
    stmt: Select = (
        select(Review)
        .options(joinedload(Review.label), selectinload(Review.mentions))
    )
    stmt = _apply_filters(
        stmt, rating=rating, search=search,
        date_from=date_from, date_to=date_to, has_reply=has_reply,
    )

    # --- Sorting ---
    descending = sort_order == "desc"
    if sort_by == "rating":
        order_primary = Review.rating.desc() if descending else Review.rating.asc()
    else:
        order_primary = Review.create_time.desc() if descending else Review.create_time.asc()
    order_tiebreak = Review.review_id.desc() if descending else Review.review_id.asc()

    # --- Cursor WHERE ---
    # The cursor always encodes (create_time, review_id) regardless of
    # sort_by.  For non-create_time sorts the secondary ordering still
    # uses create_time as tiebreaker so paging remains stable.
    if cursor is not None:
        cursor_time, cursor_id = _decode_cursor(cursor)
        if descending:
            stmt = stmt.where(
                tuple_(Review.create_time, Review.review_id)
                < tuple_(cursor_time, cursor_id)
            )
        else:
            stmt = stmt.where(
                tuple_(Review.create_time, Review.review_id)
                > tuple_(cursor_time, cursor_id)
            )

    stmt = stmt.order_by(order_primary, order_tiebreak).limit(limit + 1)

    result = (await session.execute(stmt)).scalars().unique().all()
    reviews = list(result)

    has_more = len(reviews) > limit
    if has_more:
        reviews = reviews[:limit]

    # --- Collaborator names ---
    collab_names = await _load_collab_names(session, reviews)

    # --- Build response ---
    items = [_review_to_out(r, collab_names) for r in reviews]

    next_cursor: str | None = None
    if has_more and reviews:
        last = reviews[-1]
        if last.create_time is not None:
            next_cursor = _encode_cursor(last.create_time, last.review_id)

    return ReviewListResponse(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        total=total,
    )


async def get_review(
    session: AsyncSession,
    review_id: str,
) -> ReviewDetailOut | None:
    """Fetch a single review with full detail and collaborator mentions."""
    stmt = (
        select(Review)
        .options(joinedload(Review.label), selectinload(Review.mentions))
        .where(Review.review_id == review_id)
    )
    review = (await session.execute(stmt)).scalars().unique().one_or_none()
    if review is None:
        return None

    collab_names = await _load_collab_names(session, [review])
    return _review_to_detail(review, collab_names)

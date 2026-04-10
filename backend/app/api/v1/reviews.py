"""/api/v1/reviews/* endpoints.

Read-only review listing and detail (Phase 3).
All endpoints require authentication.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import AuthenticatedUser, require_authenticated
from app.deps.db import get_session
from app.schemas.review import ReviewDetailOut, ReviewListResponse
from app.services import review_service as svc

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["reviews"])

Authenticated = Annotated[AuthenticatedUser, Depends(require_authenticated)]


def _parse_date(value: str | None) -> datetime | None:
    """Parse an ISO-format date string into a datetime, or return None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"invalid_date_format: {value}",
        ) from exc


@router.get("/", response_model=ReviewListResponse)
async def list_reviews(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    rating: int | None = Query(default=None, ge=1, le=5),
    search: str | None = Query(default=None, max_length=200),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    has_reply: bool | None = Query(default=None),
    sort_by: str = Query(default="create_time", pattern="^(create_time|rating)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> ReviewListResponse:
    return await svc.list_reviews(
        session,
        cursor=cursor,
        limit=limit,
        rating=rating,
        search=search,
        date_from=_parse_date(date_from),
        date_to=_parse_date(date_to),
        has_reply=has_reply,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/{review_id}", response_model=ReviewDetailOut)
async def get_review(
    review_id: str,
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewDetailOut:
    result = await svc.get_review(session, review_id)
    if result is None:
        raise HTTPException(status_code=404, detail="not_found")
    return result

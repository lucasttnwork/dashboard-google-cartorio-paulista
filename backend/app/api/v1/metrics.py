"""/api/v1/metrics/* endpoints.

Read-only dashboard metrics: overview KPIs, monthly trends,
and per-collaborator mention breakdowns (Phase 3).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import AuthenticatedUser, require_authenticated
from app.deps.db import get_session
from app.schemas.metrics import (
    CollaboratorMentionsOut,
    DataStatusOut,
    MetricsOverviewOut,
    MyPerformanceOut,
    TrendsOut,
)
from app.services import metrics_service as svc

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["metrics"])

Authenticated = Annotated[AuthenticatedUser, Depends(require_authenticated)]


def _validate_iso_date(value: str | None, param_name: str) -> str | None:
    """Validate an ISO (YYYY-MM-DD) query param at the handler boundary.

    Phase 3.9 SI-3: previously a malformed ``date_from`` / ``date_to``
    propagated a ``ValueError`` from ``metrics_service._parse_date`` and
    bubbled up as a 500. We now reject the request with a 422 before ever
    reaching the service — the same outcome FastAPI/Pydantic gives for
    other type-validated params.
    """
    if value is None:
        return None
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid ISO date in {param_name}",
        ) from exc
    return value


@router.get("/overview", response_model=MetricsOverviewOut)
async def get_overview(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    compare_previous: bool = Query(
        default=False,
        description="Also compute the previous period of equal duration",
    ),
) -> MetricsOverviewOut:
    date_from = _validate_iso_date(date_from, "date_from")
    date_to = _validate_iso_date(date_to, "date_to")
    return await svc.get_overview(
        session,
        date_from=date_from,
        date_to=date_to,
        compare_previous=compare_previous,
    )


@router.get("/data-status", response_model=DataStatusOut)
async def get_data_status(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    response: Response,
) -> DataStatusOut:
    """Freshness indicator: last review, last collection run, total count."""
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=60"
    )
    return await svc.get_data_status(session)


@router.get("/trends", response_model=TrendsOut)
async def get_trends(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=1, le=60),
    location_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    granularity: Literal["month", "day"] = Query(default="month"),
) -> TrendsOut:
    date_from = _validate_iso_date(date_from, "date_from")
    date_to = _validate_iso_date(date_to, "date_to")
    return await svc.get_trends(
        session,
        months=months,
        location_id=location_id,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
    )


@router.get("/collaborator-mentions", response_model=CollaboratorMentionsOut)
async def get_collaborator_mentions(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=1, le=60),
    include_inactive: bool = Query(default=False),
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
) -> CollaboratorMentionsOut:
    date_from = _validate_iso_date(date_from, "date_from")
    date_to = _validate_iso_date(date_to, "date_to")
    return await svc.get_collaborator_mentions(
        session,
        months=months,
        include_inactive=include_inactive,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/my-performance", response_model=MyPerformanceOut)
async def get_my_performance(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MyPerformanceOut:
    return await svc.get_my_performance(session, user_id=user.id)

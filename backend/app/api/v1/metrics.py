"""/api/v1/metrics/* endpoints.

Read-only dashboard metrics: overview KPIs, monthly trends,
and per-collaborator mention breakdowns (Phase 3).
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import AuthenticatedUser, require_authenticated
from app.deps.db import get_session
from app.schemas.metrics import (
    CollaboratorMentionsOut,
    MetricsOverviewOut,
    TrendsOut,
)
from app.services import metrics_service as svc

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["metrics"])

Authenticated = Annotated[AuthenticatedUser, Depends(require_authenticated)]


@router.get("/overview", response_model=MetricsOverviewOut)
async def get_overview(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
) -> MetricsOverviewOut:
    return await svc.get_overview(session, date_from=date_from, date_to=date_to)


@router.get("/trends", response_model=TrendsOut)
async def get_trends(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=1, le=60),
    location_id: str | None = Query(default=None),
) -> TrendsOut:
    return await svc.get_trends(session, months=months, location_id=location_id)


@router.get("/collaborator-mentions", response_model=CollaboratorMentionsOut)
async def get_collaborator_mentions(
    user: Authenticated,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=1, le=60),
    include_inactive: bool = Query(default=False),
) -> CollaboratorMentionsOut:
    return await svc.get_collaborator_mentions(
        session, months=months, include_inactive=include_inactive
    )

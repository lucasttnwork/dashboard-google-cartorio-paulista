"""Collection health monitoring endpoints (admin-only)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import AuthenticatedUser, require_role
from app.deps.db import get_session

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["collection-health"])

AdminOnly = Annotated[AuthenticatedUser, Depends(require_role("admin"))]


class CollectionRunHealth(BaseModel):
    id: int
    run_type: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    reviews_found: int
    reviews_new: int
    reviews_updated: int
    error_message: str | None
    execution_time_ms: int | None


class CollectionHealthResponse(BaseModel):
    runs: list[CollectionRunHealth]
    consecutive_failures: int
    last_success_at: datetime | None
    is_degraded: bool


@router.get("/", response_model=CollectionHealthResponse)
async def get_collection_health(
    user: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CollectionHealthResponse:
    result = await session.execute(
        text("""
            SELECT id, run_type, status, started_at, completed_at,
                   COALESCE(reviews_found, 0),
                   COALESCE(reviews_new, 0),
                   COALESCE(reviews_updated, 0),
                   error_message,
                   execution_time_ms
            FROM collection_runs
            ORDER BY started_at DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()

    runs = [
        CollectionRunHealth(
            id=r[0],
            run_type=r[1],
            status=r[2],
            started_at=r[3],
            completed_at=r[4],
            reviews_found=r[5],
            reviews_new=r[6],
            reviews_updated=r[7],
            error_message=r[8],
            execution_time_ms=r[9],
        )
        for r in rows
    ]

    consecutive_failures = 0
    for r in runs:
        if r.status != "completed":
            consecutive_failures += 1
        else:
            break

    last_success_at: datetime | None = None
    for r in runs:
        if r.status == "completed":
            last_success_at = r.started_at
            break

    is_degraded = consecutive_failures >= 3

    return CollectionHealthResponse(
        runs=runs,
        consecutive_failures=consecutive_failures,
        last_success_at=last_success_at,
        is_degraded=is_degraded,
    )


@router.post("/reset")
async def reset_degraded_state(
    user: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, bool]:
    logger.info("collection_health.reset", user_id=str(user.id))
    return {"ok": True}

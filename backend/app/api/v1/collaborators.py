"""/api/v1/collaborators/* endpoints.

CRUD, merge, CSV import/export for the Collaborators Admin Panel (Phase 2).
All write endpoints require role admin or manager.
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.deps.auth import AuthenticatedUser, require_role
from app.deps.db import get_session
from app.db.models.user_profile import UserProfile
from app.schemas.collaborator import (
    CSVImportResponse,
    CollaboratorCreate,
    CollaboratorListResponse,
    CollaboratorOut,
    CollaboratorUpdate,
    MergeRequest,
    MergeResponse,
)
from app.services import collaborator_service as svc

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["collaborators"])

AdminOrManager = Annotated[
    AuthenticatedUser, Depends(require_role("admin", "manager"))
]


@router.get("/", response_model=CollaboratorListResponse)
async def list_collaborators(
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
    search: str | None = Query(default=None, max_length=200),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort_by: str = Query(default="full_name"),
    sort_order: str = Query(default="asc", pattern="^(asc|desc)$"),
) -> CollaboratorListResponse:
    return await svc.list_collaborators(
        session,
        search=search,
        include_inactive=include_inactive,
        page=page,
        page_size=page_size,
        sort_by=sort_by,  # type: ignore[arg-type]
        sort_order=sort_order,  # type: ignore[arg-type]
    )


@router.get("/export")
async def export_csv(
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
    include_inactive: bool = Query(default=True),
) -> StreamingResponse:
    content = await svc.export_csv(session, include_inactive=include_inactive)
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=collaborators.csv"},
    )


@router.post("/import", response_model=CSVImportResponse)
async def import_csv(
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile,
) -> CSVImportResponse:
    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="invalid_encoding")
    return await svc.import_csv(session, content, user)


@router.post("/merge", response_model=MergeResponse)
async def merge_collaborators(
    body: MergeRequest,
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MergeResponse:
    if body.source_id == body.target_id:
        raise HTTPException(status_code=400, detail="cannot_merge_self")
    try:
        return await svc.merge_collaborators(
            session, body.source_id, body.target_id, user
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{collaborator_id}", response_model=CollaboratorOut)
async def get_collaborator(
    collaborator_id: int,
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CollaboratorOut:
    result = await svc.get_collaborator(session, collaborator_id)
    if result is None:
        raise HTTPException(status_code=404, detail="not_found")
    return result


@router.post("/", response_model=CollaboratorOut, status_code=201)
async def create_collaborator(
    body: CollaboratorCreate,
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CollaboratorOut:
    try:
        return await svc.create_collaborator(session, body, user)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="duplicate_full_name")


@router.patch("/{collaborator_id}", response_model=CollaboratorOut)
async def update_collaborator(
    collaborator_id: int,
    body: CollaboratorUpdate,
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CollaboratorOut:
    try:
        result = await svc.update_collaborator(session, collaborator_id, body, user)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="duplicate_full_name")
    if result is None:
        raise HTTPException(status_code=404, detail="not_found")
    return result


@router.delete("/{collaborator_id}", response_model=CollaboratorOut)
async def deactivate_collaborator(
    collaborator_id: int,
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CollaboratorOut:
    result = await svc.deactivate_collaborator(session, collaborator_id, user)
    if result is None:
        raise HTTPException(status_code=404, detail="not_found")
    return result


@router.post("/{collaborator_id}/reactivate", response_model=CollaboratorOut)
async def reactivate_collaborator(
    collaborator_id: int,
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CollaboratorOut:
    result = await svc.reactivate_collaborator(session, collaborator_id, user)
    if result is None:
        raise HTTPException(status_code=404, detail="not_found")
    return result


@router.get("/admin/users")
async def list_users(
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """List all system users with role and email (admin only, for linking)."""
    stmt = (
        select(UserProfile.user_id, UserProfile.role, UserProfile.disabled_at)
        .order_by(UserProfile.role, UserProfile.user_id)
    )
    rows = (await session.execute(stmt)).all()

    # Fetch emails from auth.users via raw query (service_role bypasses RLS)
    from sqlalchemy import text
    email_rows = (
        await session.execute(text("SELECT id, email FROM auth.users"))
    ).all()
    email_map = {str(r[0]): r[1] for r in email_rows}

    return [
        {
            "id": str(r[0]),
            "email": email_map.get(str(r[0]), ""),
            "role": r[1],
            "is_active": r[2] is None,
        }
        for r in rows
    ]

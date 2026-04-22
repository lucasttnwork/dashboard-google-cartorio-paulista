"""/api/v1/admin/users/* — user management CRUD (admin only).

Endpoints:
- GET    /            list users (admin + manager; read-only for linkage)
- POST   /            create user via Supabase Auth admin + user_profile row
- PATCH  /{user_id}   update role / is_active / collaborator link
- DELETE /{user_id}   hard-delete auth.users; unlinks + deactivates any
                      linked collaborator (collaborator row is preserved)

Guards:
- ``require_role("admin")`` on write operations
- Self-modify forbidden on PATCH/DELETE
- Last active admin cannot be disabled/deleted/demoted
- Inactivation is soft: sets ``user_profiles.disabled_at`` — the existing
  ``get_current_user`` dependency returns 403 on next request
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log import AuditLog
from app.db.models.collaborator import Collaborator
from app.db.models.user_profile import UserProfile
from app.deps.auth import AuthenticatedUser, require_role
from app.deps.db import get_session
from app.schemas.admin_user import (
    AdminUserCreate,
    AdminUserCreateResponse,
    AdminUserListResponse,
    AdminUserOut,
    AdminUserUpdate,
    Role,
)
from app.services.supabase_auth import (
    SupabaseAuthClient,
    SupabaseAuthError,
)
from app.deps.auth import get_supabase_auth

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["admin-users"])

AdminOnly = Annotated[AuthenticatedUser, Depends(require_role("admin"))]
AdminOrManager = Annotated[
    AuthenticatedUser, Depends(require_role("admin", "manager"))
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(
    session: AsyncSession,
    *,
    action: str,
    actor: AuthenticatedUser,
    target_user_id: UUID,
    diff: dict,
) -> None:
    """Append audit_log row (flushed with the transaction).

    entity_type = 'user', entity_id is unused (0) because auth.users keys
    by UUID; the target user id is carried in diff['target_user_id'].
    """
    session.add(
        AuditLog(
            entity_type="user",
            entity_id=0,
            action=action,
            actor_id=actor.id,
            actor_email=actor.email,
            diff={"target_user_id": str(target_user_id), **diff},
            created_at=_now(),
        )
    )


async def _fetch_emails(session: AsyncSession, ids: list[UUID]) -> dict[str, str]:
    """Return {uuid_str: email} for the given user ids by reading auth.users.

    service_role bypasses RLS. Empty input returns {}.
    """
    if not ids:
        return {}
    rows = (
        await session.execute(
            text("SELECT id::text, email FROM auth.users WHERE id = ANY(:ids)"),
            {"ids": [str(i) for i in ids]},
        )
    ).all()
    return {r[0]: r[1] or "" for r in rows}


async def _count_active_admins(session: AsyncSession) -> int:
    stmt = select(func.count()).select_from(UserProfile).where(
        UserProfile.role == "admin", UserProfile.disabled_at.is_(None)
    )
    return int((await session.execute(stmt)).scalar_one())


async def _get_collaborator_for_user(
    session: AsyncSession, user_id: UUID
) -> Collaborator | None:
    return await session.scalar(
        select(Collaborator).where(Collaborator.user_id == user_id)
    )


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


@router.get("/", response_model=AdminUserListResponse)
async def list_users(
    user: AdminOrManager,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserListResponse:
    """List all platform users joined with email and linked collaborator."""
    profiles = (
        await session.execute(
            select(UserProfile).order_by(UserProfile.role, UserProfile.user_id)
        )
    ).scalars().all()
    if not profiles:
        return AdminUserListResponse(items=[])

    ids = [p.user_id for p in profiles]
    emails = await _fetch_emails(session, ids)

    collabs = (
        await session.execute(
            select(Collaborator.user_id, Collaborator.id, Collaborator.full_name)
            .where(Collaborator.user_id.in_(ids))
        )
    ).all()
    collab_map = {str(r[0]): (r[1], r[2]) for r in collabs}

    items = []
    for p in profiles:
        col = collab_map.get(str(p.user_id))
        items.append(
            AdminUserOut(
                id=p.user_id,
                email=emails.get(str(p.user_id), ""),
                role=p.role,  # type: ignore[arg-type]
                is_active=p.disabled_at is None,
                collaborator_id=col[0] if col else None,
                collaborator_name=col[1] if col else None,
                created_at=p.created_at,
            )
        )
    return AdminUserListResponse(items=items)


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


@router.post("/", response_model=AdminUserCreateResponse, status_code=201)
async def create_user(
    body: AdminUserCreate,
    actor: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
) -> AdminUserCreateResponse:
    """Create an auth user + user_profile row, optionally linking a collaborator."""
    try:
        supa_user = await supabase.admin_create_user(
            email=body.email,
            password=body.password,
            email_confirm=True,
            app_metadata={"must_change_password": True},
        )
    except SupabaseAuthError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    now = _now()
    profile = UserProfile(
        user_id=supa_user.id,
        role=body.role,
        created_at=now,
        updated_at=now,
        disabled_at=None,
    )
    session.add(profile)

    collaborator_id: int | None = None
    if body.collaborator_id is not None:
        col = await session.scalar(
            select(Collaborator).where(Collaborator.id == body.collaborator_id)
        )
        if col is None:
            # Rollback Supabase create to stay consistent
            await session.rollback()
            try:
                await supabase.admin_delete_user(supa_user.id)
            except SupabaseAuthError:
                logger.warning(
                    "admin_users.rollback_delete_failed", user_id=str(supa_user.id)
                )
            raise HTTPException(status_code=404, detail="collaborator_not_found")

        # Unique FK — fail if the collaborator already has a user.
        if col.user_id is not None and col.user_id != supa_user.id:
            await session.rollback()
            try:
                await supabase.admin_delete_user(supa_user.id)
            except SupabaseAuthError:
                logger.warning(
                    "admin_users.rollback_delete_failed", user_id=str(supa_user.id)
                )
            raise HTTPException(status_code=409, detail="collaborator_already_linked")

        col.user_id = supa_user.id
        col.updated_at = now
        collaborator_id = col.id

    _audit(
        session,
        action="create",
        actor=actor,
        target_user_id=supa_user.id,
        diff={
            "email": body.email,
            "role": body.role,
            "collaborator_id": collaborator_id,
        },
    )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        try:
            await supabase.admin_delete_user(supa_user.id)
        except SupabaseAuthError:
            logger.warning(
                "admin_users.rollback_delete_failed", user_id=str(supa_user.id)
            )
        raise HTTPException(status_code=409, detail="conflict") from exc

    logger.info(
        "admin.users.create",
        actor_user_id=str(actor.id),
        target_user_id=str(supa_user.id),
        role=body.role,
    )

    return AdminUserCreateResponse(
        id=supa_user.id,
        email=body.email,
        role=body.role,
        is_active=True,
        collaborator_id=collaborator_id,
        temp_password=body.password,
    )


# ---------------------------------------------------------------------------
# PATCH /{user_id}
# ---------------------------------------------------------------------------


@router.patch("/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: UUID,
    body: AdminUserUpdate,
    actor: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    """Update role, active state, or collaborator linkage.

    Guards:
    - Admin cannot self-modify role or deactivate themselves.
    - Last active admin cannot be demoted or disabled.
    """
    profile = await session.scalar(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="not_found")

    is_self = actor.id == user_id
    changes: dict = {}

    # --- Role change -------------------------------------------------------
    if body.role is not None and body.role != profile.role:
        if is_self:
            raise HTTPException(status_code=409, detail="cannot_modify_self")
        if profile.role == "admin" and body.role != "admin":
            # Demoting an admin — ensure another active admin remains
            admins = await _count_active_admins(session)
            if admins <= 1:
                raise HTTPException(status_code=409, detail="last_admin")
        changes["role"] = {"from": profile.role, "to": body.role}
        profile.role = body.role

    # --- Activation toggle -------------------------------------------------
    if body.is_active is not None:
        desired_active = body.is_active
        currently_active = profile.disabled_at is None
        if desired_active != currently_active:
            if is_self and not desired_active:
                raise HTTPException(status_code=409, detail="cannot_disable_self")
            if (
                not desired_active
                and profile.role == "admin"
                and profile.disabled_at is None
            ):
                admins = await _count_active_admins(session)
                if admins <= 1:
                    raise HTTPException(status_code=409, detail="last_admin")
            if desired_active:
                changes["is_active"] = {"from": False, "to": True}
                profile.disabled_at = None
            else:
                changes["is_active"] = {"from": True, "to": False}
                profile.disabled_at = _now()

    # --- Collaborator linkage ---------------------------------------------
    existing = await _get_collaborator_for_user(session, user_id)

    if body.clear_collaborator and existing is not None:
        changes["collaborator_id"] = {"from": existing.id, "to": None}
        existing.user_id = None
        existing.updated_at = _now()
        existing = None
    elif body.collaborator_id is not None:
        if existing is not None and existing.id == body.collaborator_id:
            pass  # no-op
        else:
            new_col = await session.scalar(
                select(Collaborator).where(Collaborator.id == body.collaborator_id)
            )
            if new_col is None:
                raise HTTPException(status_code=404, detail="collaborator_not_found")
            if new_col.user_id is not None and new_col.user_id != user_id:
                raise HTTPException(
                    status_code=409, detail="collaborator_already_linked"
                )
            if existing is not None:
                existing.user_id = None
                existing.updated_at = _now()
            new_col.user_id = user_id
            new_col.updated_at = _now()
            changes["collaborator_id"] = {
                "from": existing.id if existing else None,
                "to": new_col.id,
            }
            existing = new_col

    if changes:
        profile.updated_at = _now()
        _audit(
            session,
            action="update",
            actor=actor,
            target_user_id=user_id,
            diff=changes,
        )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="conflict") from exc

    emails = await _fetch_emails(session, [user_id])
    logger.info(
        "admin.users.update",
        actor_user_id=str(actor.id),
        target_user_id=str(user_id),
        changes=changes,
    )
    return AdminUserOut(
        id=profile.user_id,
        email=emails.get(str(user_id), ""),
        role=profile.role,  # type: ignore[arg-type]
        is_active=profile.disabled_at is None,
        collaborator_id=existing.id if existing else None,
        collaborator_name=existing.full_name if existing else None,
        created_at=profile.created_at,
    )


# ---------------------------------------------------------------------------
# DELETE /{user_id}
# ---------------------------------------------------------------------------


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    actor: AdminOnly,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
) -> None:
    """Hard-delete user. Preserves linked collaborator (unlinked + deactivated)."""
    if actor.id == user_id:
        raise HTTPException(status_code=409, detail="cannot_delete_self")

    profile = await session.scalar(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="not_found")

    if profile.role == "admin" and profile.disabled_at is None:
        admins = await _count_active_admins(session)
        if admins <= 1:
            raise HTTPException(status_code=409, detail="last_admin")

    # Unlink and deactivate any collaborator before the user disappears.
    # ON DELETE SET NULL on the FK would null the user_id automatically, but
    # we also want to flip is_active=false, so we do it explicitly.
    col = await _get_collaborator_for_user(session, user_id)
    collaborator_id_before: int | None = None
    if col is not None:
        collaborator_id_before = col.id
        await session.execute(
            update(Collaborator)
            .where(Collaborator.id == col.id)
            .values(user_id=None, is_active=False, updated_at=_now())
        )

    _audit(
        session,
        action="delete",
        actor=actor,
        target_user_id=user_id,
        diff={
            "role": profile.role,
            "collaborator_id": collaborator_id_before,
        },
    )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="conflict") from exc

    try:
        await supabase.admin_delete_user(user_id)
    except SupabaseAuthError as exc:
        # DB state already points at a deactivated collaborator; surface upstream error.
        logger.error(
            "admin.users.delete.upstream_failed",
            target_user_id=str(user_id),
            reason=exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    logger.info(
        "admin.users.delete",
        actor_user_id=str(actor.id),
        target_user_id=str(user_id),
    )

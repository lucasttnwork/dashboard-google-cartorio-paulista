"""Collaborator CRUD, merge, and CSV service.

All mutating operations write to audit_log in the same transaction.
The caller (API layer) provides the AsyncSession and the authenticated user.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any, Literal

import structlog
from sqlalchemy import Select, case, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log import AuditLog
from app.db.models.collaborator import Collaborator, ReviewCollaborator
from app.deps.auth import AuthenticatedUser
from app.schemas.collaborator import (
    CSVImportResponse,
    CSVImportRow,
    CollaboratorCreate,
    CollaboratorListResponse,
    CollaboratorOut,
    CollaboratorUpdate,
    MergeResponse,
)

logger = structlog.get_logger(__name__)

SortColumn = Literal["full_name", "department", "position", "is_active", "created_at", "mention_count"]
SortOrder = Literal["asc", "desc"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(
    session: AsyncSession,
    *,
    entity_type: str,
    entity_id: int,
    action: str,
    actor: AuthenticatedUser,
    diff: dict[str, Any],
) -> None:
    """Add an audit_log entry to the session (flushed with the transaction)."""
    session.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_id=actor.id,
            actor_email=actor.email,
            diff=diff,
            created_at=_now(),
        )
    )


def _base_query(
    *,
    search: str | None = None,
    include_inactive: bool = False,
) -> Select:
    """Build the base collaborator query with optional search and active filter."""
    mention_count = (
        select(func.count())
        .where(ReviewCollaborator.collaborator_id == Collaborator.id)
        .correlate(Collaborator)
        .scalar_subquery()
        .label("mention_count")
    )
    stmt = select(Collaborator, mention_count)

    if not include_inactive:
        stmt = stmt.where(Collaborator.is_active.is_(True))

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                func.lower(Collaborator.full_name).contains(func.lower(search)),
                Collaborator.aliases.any(pattern),
            )
        )

    return stmt


def _to_out(row: Any) -> CollaboratorOut:
    """Convert a (Collaborator, mention_count) row tuple to a schema."""
    collab: Collaborator = row[0]
    mention_count: int = row[1] or 0
    return CollaboratorOut(
        id=collab.id,
        full_name=collab.full_name,
        aliases=collab.aliases or [],
        department=collab.department,
        position=collab.position,
        is_active=collab.is_active,
        mention_count=mention_count,
        created_at=collab.created_at,
        updated_at=collab.updated_at,
    )


async def list_collaborators(
    session: AsyncSession,
    *,
    search: str | None = None,
    include_inactive: bool = False,
    page: int = 1,
    page_size: int = 50,
    sort_by: SortColumn = "full_name",
    sort_order: SortOrder = "asc",
) -> CollaboratorListResponse:
    """Return a paginated, filterable list of collaborators with mention counts."""
    base = _base_query(search=search, include_inactive=include_inactive)

    # Count total
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    # Sorting
    mention_count_sub = (
        select(func.count())
        .where(ReviewCollaborator.collaborator_id == Collaborator.id)
        .correlate(Collaborator)
        .scalar_subquery()
    )

    if sort_by == "mention_count":
        order_col = mention_count_sub
    else:
        order_col = getattr(Collaborator, sort_by, Collaborator.full_name)

    if sort_order == "desc":
        order_col = order_col.desc()

    stmt = base.order_by(order_col).offset((page - 1) * page_size).limit(page_size)

    rows = (await session.execute(stmt)).all()
    items = [_to_out(r) for r in rows]

    return CollaboratorListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


async def get_collaborator(
    session: AsyncSession,
    collaborator_id: int,
) -> CollaboratorOut | None:
    """Fetch a single collaborator with mention count."""
    mention_count = (
        select(func.count())
        .where(ReviewCollaborator.collaborator_id == Collaborator.id)
        .correlate(Collaborator)
        .scalar_subquery()
        .label("mention_count")
    )
    stmt = (
        select(Collaborator, mention_count)
        .where(Collaborator.id == collaborator_id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    return _to_out(row)


async def create_collaborator(
    session: AsyncSession,
    data: CollaboratorCreate,
    actor: AuthenticatedUser,
) -> CollaboratorOut:
    """Create a new collaborator and write audit log."""
    now = _now()
    collab = Collaborator(
        full_name=data.full_name.strip(),
        aliases=[a.strip() for a in data.aliases if a.strip()],
        department=data.department,
        position=data.position,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    session.add(collab)
    await session.flush()  # get collab.id

    _audit(
        session,
        entity_type="collaborator",
        entity_id=collab.id,
        action="create",
        actor=actor,
        diff={
            "full_name": collab.full_name,
            "aliases": collab.aliases,
            "department": collab.department,
            "position": collab.position,
        },
    )
    await session.commit()

    return await get_collaborator(session, collab.id)  # type: ignore[return-value]


async def update_collaborator(
    session: AsyncSession,
    collaborator_id: int,
    data: CollaboratorUpdate,
    actor: AuthenticatedUser,
) -> CollaboratorOut | None:
    """Update a collaborator's fields. Returns None if not found."""
    collab = await session.get(Collaborator, collaborator_id)
    if collab is None:
        return None

    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    aliases_changed = False

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        old = getattr(collab, field)
        if field == "full_name" and value is not None:
            value = value.strip()
        if field == "aliases" and value is not None:
            value = [a.strip() for a in value if a.strip()]
            if set(value) != set(old or []):
                aliases_changed = True
        if old != value:
            before[field] = old
            after[field] = value
            setattr(collab, field, value)

    if not after:
        return await get_collaborator(session, collaborator_id)

    collab.updated_at = _now()

    _audit(
        session,
        entity_type="collaborator",
        entity_id=collaborator_id,
        action="update",
        actor=actor,
        diff={"before": before, "after": after},
    )
    await session.commit()

    result = await get_collaborator(session, collaborator_id)

    if aliases_changed:
        logger.info(
            "collaborator.aliases_changed",
            collaborator_id=collaborator_id,
            enqueue_reprocess=True,
        )

    return result


async def deactivate_collaborator(
    session: AsyncSession,
    collaborator_id: int,
    actor: AuthenticatedUser,
) -> CollaboratorOut | None:
    """Soft-delete a collaborator (set is_active=false)."""
    collab = await session.get(Collaborator, collaborator_id)
    if collab is None:
        return None

    collab.is_active = False
    collab.updated_at = _now()

    _audit(
        session,
        entity_type="collaborator",
        entity_id=collaborator_id,
        action="deactivate",
        actor=actor,
        diff={"is_active": {"before": True, "after": False}},
    )
    await session.commit()
    return await get_collaborator(session, collaborator_id)


async def reactivate_collaborator(
    session: AsyncSession,
    collaborator_id: int,
    actor: AuthenticatedUser,
) -> CollaboratorOut | None:
    """Reactivate a deactivated collaborator."""
    collab = await session.get(Collaborator, collaborator_id)
    if collab is None:
        return None

    collab.is_active = True
    collab.updated_at = _now()

    _audit(
        session,
        entity_type="collaborator",
        entity_id=collaborator_id,
        action="reactivate",
        actor=actor,
        diff={"is_active": {"before": False, "after": True}},
    )
    await session.commit()
    return await get_collaborator(session, collaborator_id)


async def merge_collaborators(
    session: AsyncSession,
    source_id: int,
    target_id: int,
    actor: AuthenticatedUser,
) -> MergeResponse:
    """Merge source collaborator into target.

    1. SELECT FOR UPDATE both rows.
    2. Transfer review_collaborators from source → target (ON CONFLICT keep higher match_score).
    3. Merge aliases: target.aliases += [source.full_name] + source.aliases.
    4. Soft-delete source.
    5. Write audit log.
    """
    # Lock both rows
    source = (
        await session.execute(
            select(Collaborator)
            .where(Collaborator.id == source_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    target = (
        await session.execute(
            select(Collaborator)
            .where(Collaborator.id == target_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if source is None or target is None:
        raise ValueError("source or target not found")

    # Count mentions to transfer
    source_mentions = (
        await session.execute(
            select(func.count()).where(
                ReviewCollaborator.collaborator_id == source_id
            )
        )
    ).scalar() or 0

    # Get existing target review_ids to detect conflicts
    target_review_ids_result = await session.execute(
        select(ReviewCollaborator.review_id).where(
            ReviewCollaborator.collaborator_id == target_id
        )
    )
    target_review_ids = {r[0] for r in target_review_ids_result.all()}

    # Get source mentions
    source_mentions_result = await session.execute(
        select(ReviewCollaborator).where(
            ReviewCollaborator.collaborator_id == source_id
        )
    )
    source_rows = source_mentions_result.scalars().all()

    transferred = 0
    for row in source_rows:
        if row.review_id in target_review_ids:
            # Conflict: keep whichever has higher match_score
            existing = (
                await session.execute(
                    select(ReviewCollaborator).where(
                        ReviewCollaborator.review_id == row.review_id,
                        ReviewCollaborator.collaborator_id == target_id,
                    )
                )
            ).scalar_one()
            if (row.match_score or 0) > (existing.match_score or 0):
                existing.mention_snippet = row.mention_snippet
                existing.match_score = row.match_score
                existing.context_found = row.context_found
        else:
            # No conflict: re-point to target
            row.collaborator_id = target_id
            transferred += 1

    # Delete remaining source rows (the conflicting ones that lost)
    await session.execute(
        delete(ReviewCollaborator).where(
            ReviewCollaborator.collaborator_id == source_id
        )
    )

    # Merge aliases
    new_aliases_set: set[str] = set(target.aliases or [])
    new_aliases_set.add(source.full_name.strip())
    for a in source.aliases or []:
        if a.strip():
            new_aliases_set.add(a.strip())
    # Remove target's own full_name from aliases if present
    new_aliases_set.discard(target.full_name.strip())
    aliases_added = sorted(new_aliases_set - set(target.aliases or []))

    target.aliases = sorted(new_aliases_set)
    target.updated_at = _now()

    # Soft-delete source
    source.is_active = False
    source.updated_at = _now()

    _audit(
        session,
        entity_type="collaborator",
        entity_id=target_id,
        action="merge",
        actor=actor,
        diff={
            "source_id": source_id,
            "source_name": source.full_name,
            "target_id": target_id,
            "target_name": target.full_name,
            "mentions_transferred": transferred,
            "mentions_conflict_resolved": source_mentions - transferred,
            "aliases_added": aliases_added,
        },
    )
    await session.commit()

    logger.info(
        "collaborator.merged",
        source_id=source_id,
        target_id=target_id,
        transferred=transferred,
    )

    return MergeResponse(
        target_id=target_id,
        mentions_transferred=transferred,
        aliases_added=aliases_added,
        source_deactivated=True,
    )


async def export_csv(
    session: AsyncSession,
    *,
    include_inactive: bool = False,
) -> str:
    """Generate CSV content for collaborators export."""
    stmt = _base_query(include_inactive=include_inactive).order_by(Collaborator.full_name)
    rows = (await session.execute(stmt)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "full_name", "aliases", "department", "position", "is_active", "mention_count", "created_at"])

    for row in rows:
        collab: Collaborator = row[0]
        mentions: int = row[1] or 0
        writer.writerow([
            collab.id,
            collab.full_name,
            "; ".join(collab.aliases or []),
            collab.department or "",
            collab.position or "",
            collab.is_active,
            mentions,
            collab.created_at.isoformat() if collab.created_at else "",
        ])

    return output.getvalue()


async def import_csv(
    session: AsyncSession,
    content: str,
    actor: AuthenticatedUser,
) -> CSVImportResponse:
    """Import collaborators from CSV content.

    Creates new collaborators for unknown full_names.
    Updates existing collaborators if full_name matches.
    Returns per-row errors without aborting the entire import.
    """
    reader = csv.DictReader(io.StringIO(content))
    created = 0
    updated = 0
    errors: list[CSVImportRow] = []

    for i, row in enumerate(reader, start=2):  # row 1 is header
        full_name = (row.get("full_name") or "").strip()
        if not full_name:
            errors.append(CSVImportRow(row=i, error="full_name required"))
            continue

        aliases_raw = (row.get("aliases") or "").strip()
        aliases = [a.strip() for a in aliases_raw.split(";") if a.strip()] if aliases_raw else []
        department = (row.get("department") or "E-notariado").strip() or None
        position = (row.get("position") or "").strip() or None

        existing = (
            await session.execute(
                select(Collaborator).where(Collaborator.full_name == full_name)
            )
        ).scalar_one_or_none()

        now = _now()
        if existing is None:
            collab = Collaborator(
                full_name=full_name,
                aliases=aliases,
                department=department,
                position=position,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(collab)
            await session.flush()
            _audit(
                session,
                entity_type="collaborator",
                entity_id=collab.id,
                action="import",
                actor=actor,
                diff={"full_name": full_name, "source": "csv_import"},
            )
            created += 1
        else:
            changed = False
            if aliases and set(aliases) != set(existing.aliases or []):
                existing.aliases = aliases
                changed = True
            if department and department != existing.department:
                existing.department = department
                changed = True
            if position and position != existing.position:
                existing.position = position
                changed = True
            if changed:
                existing.updated_at = now
                _audit(
                    session,
                    entity_type="collaborator",
                    entity_id=existing.id,
                    action="import",
                    actor=actor,
                    diff={"full_name": full_name, "source": "csv_import", "action": "update"},
                )
                updated += 1

    await session.commit()
    return CSVImportResponse(created=created, updated=updated, errors=errors)

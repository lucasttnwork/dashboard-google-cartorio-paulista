"""ORM model for the public.audit_log table.

Append-only audit trail for entity mutations. Created by migration
``20260410200000_audit_log.sql`` (T2.W2.1). Written by the backend
via service_role (RLS deny_all in effect).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.user_profile import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[int] = mapped_column(nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    actor_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    actor_email: Mapped[str] = mapped_column(Text, nullable=False)
    diff: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

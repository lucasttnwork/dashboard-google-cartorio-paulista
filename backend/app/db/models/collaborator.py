"""ORM models for collaborators and review_collaborators tables.

Both tables pre-exist in production (baseline migration). The backend
reads/writes them via service_role (RLS deny_all in effect).
"""

from __future__ import annotations

from datetime import datetime

from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.user_profile import Base


class Collaborator(Base):
    __tablename__ = "collaborators"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    aliases: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list
    )
    department: Mapped[str | None] = mapped_column(
        Text, nullable=True, default="E-notariado"
    )
    position: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    user_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class ReviewCollaborator(Base):
    __tablename__ = "review_collaborators"
    __table_args__ = {"schema": "public"}

    review_id: Mapped[str] = mapped_column(String, primary_key=True)
    collaborator_id: Mapped[int] = mapped_column(primary_key=True)
    mention_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_found: Mapped[str | None] = mapped_column(Text, nullable=True)

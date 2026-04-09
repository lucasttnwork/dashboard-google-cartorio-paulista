"""ORM model for the public.user_profiles table.

Backs `deps/auth.py` role lookups. The table is created by migration
``<ts>_user_profiles.sql`` (T1.W2.1). Read by the backend via
service_role (no RLS permissive policies; the baseline deny_all from
Phase 0 remains in force).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, declarative_base, mapped_column

Base = declarative_base()


class UserProfile(Base):
    """BFF-side role assignment for users that exist in auth.users.

    Mirror of the public.user_profiles table created by migration
    <ts>_user_profiles.sql. Read by the backend via service_role (no RLS
    permissive policies; the baseline deny_all from Phase 0 remains in
    force).
    """

    __tablename__ = "user_profiles"
    __table_args__ = (
        CheckConstraint(
            "role in ('admin','manager','viewer')",
            name="user_profiles_role_check",
        ),
        {"schema": "public"},
    )

    user_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    disabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def is_active(self) -> bool:
        return self.disabled_at is None

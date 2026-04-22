"""Shared fixtures for collaborator test suite (Phase 2).

Creates an in-memory SQLite database with the collaborators,
review_collaborators, and audit_log tables.  Overrides FastAPI
dependencies so that:

- ``get_session`` yields a real AsyncSession (aiosqlite).
- ``get_current_user`` returns a fake admin user (no JWT validation).

Uses raw DDL because the ORM models use Pg-specific types
(``ARRAY``, ``JSONB``, ``PgUUID``) that SQLite cannot handle directly.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1 import collaborators as collab_module
from app.deps.auth import AuthenticatedUser, get_current_user
from app.deps.db import get_session

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
_ADMIN_EMAIL = "admin@cartorio.test"
_NOW = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)

_DDL = """
CREATE TABLE IF NOT EXISTS collaborators (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT    NOT NULL UNIQUE,
    aliases   TEXT    NOT NULL DEFAULT '[]',
    department TEXT,
    position  TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    user_id   TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_collaborators (
    review_id       TEXT    NOT NULL,
    collaborator_id INTEGER NOT NULL,
    mention_snippet TEXT,
    match_score     REAL,
    context_found   TEXT,
    PRIMARY KEY (review_id, collaborator_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,
    entity_id    INTEGER NOT NULL,
    action       TEXT NOT NULL,
    actor_id     TEXT NOT NULL,
    actor_email  TEXT NOT NULL,
    diff         TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id     TEXT PRIMARY KEY,
    role        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    disabled_at TEXT
);
"""


# ---------------------------------------------------------------------------
# SQLite compat: monkey-patch ARRAY and JSONB for aiosqlite
# ---------------------------------------------------------------------------


def _patch_models_for_sqlite():
    """Replace Pg-specific column types and strip ``schema='public'``
    so the ORM works against in-memory SQLite.

    This is a test-only concern; production uses real PostgreSQL.
    """
    import json

    from sqlalchemy import TypeDecorator, Text as SaText

    class JSONList(TypeDecorator):
        """Store list[str] as JSON text in SQLite."""
        impl = SaText
        cache_ok = True

        def process_bind_param(self, value, dialect):
            if value is None:
                return "[]"
            return json.dumps(value)

        def process_result_value(self, value, dialect):
            if value is None:
                return []
            return json.loads(value)

    class JSONDict(TypeDecorator):
        """Store dict as JSON text in SQLite."""
        impl = SaText
        cache_ok = True

        def process_bind_param(self, value, dialect):
            if value is None:
                return "{}"
            return json.dumps(value)

        def process_result_value(self, value, dialect):
            if value is None:
                return {}
            return json.loads(value)

    class UUIDStr(TypeDecorator):
        """Store UUID as TEXT in SQLite."""
        impl = SaText
        cache_ok = True

        def process_bind_param(self, value, dialect):
            if value is None:
                return None
            return str(value)

        def process_result_value(self, value, dialect):
            if value is None:
                return None
            return uuid.UUID(value)

    from app.db.models.collaborator import Collaborator, ReviewCollaborator
    from app.db.models.audit_log import AuditLog
    from app.db.models.user_profile import UserProfile

    # --- Strip schema="public" so SQLite sees bare table names ---
    for model in (Collaborator, ReviewCollaborator, AuditLog, UserProfile):
        model.__table__.schema = None

    # --- Replace Pg-specific column types ---
    # Collaborator.aliases: ARRAY(Text) -> JSONList
    Collaborator.__table__.c.aliases.type = JSONList()

    # Collaborator.user_id: PgUUID -> UUIDStr
    Collaborator.__table__.c.user_id.type = UUIDStr()

    # AuditLog.diff: JSONB -> JSONDict
    AuditLog.__table__.c.diff.type = JSONDict()

    # AuditLog.actor_id: PgUUID -> UUIDStr
    AuditLog.__table__.c.actor_id.type = UUIDStr()

    # UserProfile.user_id: PgUUID -> UUIDStr
    UserProfile.__table__.c.user_id.type = UUIDStr()


_patch_models_for_sqlite()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_admin(
    uid: uuid.UUID = _ADMIN_ID,
    email: str = _ADMIN_EMAIL,
    role: str = "admin",
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=uid,
        email=email,
        role=role,  # type: ignore[arg-type]
        created_at=_NOW,
        disabled_at=None,
    )


@pytest.fixture()
async def db_engine():
    """In-memory SQLite engine with collaborator tables."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        for stmt in _DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt))
    yield engine
    await engine.dispose()


@pytest.fixture()
async def db_session(db_engine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    async with maker() as session:
        yield session


@pytest.fixture()
def admin_user() -> AuthenticatedUser:
    return _make_admin()


def _make_app(
    *,
    db_session: AsyncSession,
    user: AuthenticatedUser | None = None,
) -> FastAPI:
    """Build minimal FastAPI with collaborators router and overridden deps."""
    test_app = FastAPI()
    test_app.include_router(collab_module.router, prefix="/api/v1/collaborators")

    async def _session_dep() -> AsyncIterator[AsyncSession]:
        yield db_session

    test_app.dependency_overrides[get_session] = _session_dep

    if user is None:
        user = _make_admin()

    _user = user

    async def _user_dep() -> AuthenticatedUser:
        return _user

    test_app.dependency_overrides[get_current_user] = _user_dep

    return test_app


@pytest.fixture()
def app(db_session: AsyncSession, admin_user: AuthenticatedUser) -> FastAPI:
    return _make_app(db_session=db_session, user=admin_user)


@pytest.fixture()
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

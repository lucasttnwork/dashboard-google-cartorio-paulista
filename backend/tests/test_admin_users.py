"""Integration tests for /api/v1/admin/users/* (user management CRUD).

Reuses the sqlite + FastAPI harness from conftest but mounts the
admin_users router and stubs SupabaseAuthClient (only ``admin_create_user``
and ``admin_delete_user`` are exercised).

The real listing endpoint runs a raw Pg query against ``auth.users`` for
emails; in tests we monkeypatch the module-level ``_fetch_emails`` helper
to return a test-controlled map instead.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1 import admin_users as admin_users_module
from app.deps.auth import AuthenticatedUser, get_current_user, get_supabase_auth
from app.deps.db import get_session
from app.services.supabase_auth import SupabaseAuthError, SupabaseUser

_NOW = datetime(2026, 4, 22, 12, 0, 0, tzinfo=timezone.utc)
_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
_OTHER_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
_TARGET_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")


def _make_user(
    uid: uuid.UUID,
    role: str = "admin",
    email: str = "admin@test.com",
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=uid, email=email, role=role, created_at=_NOW, disabled_at=None  # type: ignore[arg-type]
    )


class _FakeSupabase:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []
        self.deleted: list[str] = []
        self.create_error: SupabaseAuthError | None = None
        self.delete_error: SupabaseAuthError | None = None
        self._next_uid: uuid.UUID | None = None

    def with_next_uid(self, uid: uuid.UUID) -> None:
        self._next_uid = uid

    async def admin_create_user(
        self,
        email: str,
        password: str,
        *,
        email_confirm: bool = True,
        app_metadata: dict[str, Any] | None = None,
    ) -> SupabaseUser:
        self.created.append({"email": email, "password": password})
        if self.create_error is not None:
            raise self.create_error
        uid = self._next_uid or uuid.uuid4()
        self._next_uid = None
        return SupabaseUser(id=uid, email=email)

    async def admin_delete_user(self, user_id: Any) -> None:
        self.deleted.append(str(user_id))
        if self.delete_error is not None:
            raise self.delete_error


async def _insert_profile(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    role: str = "viewer",
    disabled_at: datetime | None = None,
) -> None:
    await session.execute(
        text(
            "INSERT INTO user_profiles (user_id, role, created_at, updated_at, disabled_at) "
            "VALUES (:uid, :role, :ca, :ua, :da)"
        ),
        {
            "uid": str(user_id),
            "role": role,
            "ca": _NOW.isoformat(),
            "ua": _NOW.isoformat(),
            "da": disabled_at.isoformat() if disabled_at else None,
        },
    )
    await session.commit()


@pytest.fixture()
async def patched_emails(monkeypatch: pytest.MonkeyPatch) -> dict[uuid.UUID, str]:
    """Monkeypatch admin_users._fetch_emails to return a test-controlled map."""
    mapping: dict[uuid.UUID, str] = {}

    async def _fake_fetch(session: AsyncSession, ids: list[uuid.UUID]) -> dict[str, str]:
        return {str(i): mapping.get(i, f"{str(i)[:8]}@test.com") for i in ids}

    monkeypatch.setattr(admin_users_module, "_fetch_emails", _fake_fetch)
    return mapping


@pytest.fixture()
def fake_supabase() -> _FakeSupabase:
    return _FakeSupabase()


def _make_admin_app(
    db_session: AsyncSession,
    user: AuthenticatedUser,
    supabase: _FakeSupabase,
) -> FastAPI:
    app = FastAPI()
    app.include_router(admin_users_module.router, prefix="/api/v1/admin/users")

    async def _session_dep() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _session_dep
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_supabase_auth] = lambda: supabase
    return app


@pytest.fixture()
async def admin_client(
    db_session: AsyncSession,
    fake_supabase: _FakeSupabase,
    patched_emails: dict[uuid.UUID, str],
) -> AsyncIterator[AsyncClient]:
    await _insert_profile(db_session, _ADMIN_ID, role="admin")
    await _insert_profile(db_session, _OTHER_ADMIN_ID, role="admin")
    patched_emails[_ADMIN_ID] = "admin@test.com"
    patched_emails[_OTHER_ADMIN_ID] = "admin2@test.com"
    user = _make_user(_ADMIN_ID, role="admin")
    app = _make_admin_app(db_session, user, fake_supabase)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def viewer_client(
    db_session: AsyncSession,
    fake_supabase: _FakeSupabase,
    patched_emails: dict[uuid.UUID, str],
) -> AsyncIterator[AsyncClient]:
    await _insert_profile(db_session, _ADMIN_ID, role="admin")
    viewer_id = uuid.UUID("00000000-0000-0000-0000-000000000099")
    await _insert_profile(db_session, viewer_id, role="viewer")
    user = _make_user(viewer_id, role="viewer", email="viewer@test.com")
    app = _make_admin_app(db_session, user, fake_supabase)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_returns_all_profiles(admin_client: AsyncClient) -> None:
    resp = await admin_client.get("/api/v1/admin/users/")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    emails = {it["email"] for it in items}
    assert emails == {"admin@test.com", "admin2@test.com"}
    assert all(it["is_active"] is True for it in items)


@pytest.mark.asyncio
async def test_list_users_forbidden_for_viewer(viewer_client: AsyncClient) -> None:
    resp = await viewer_client.get("/api/v1/admin/users/")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_user_happy_path(
    admin_client: AsyncClient,
    fake_supabase: _FakeSupabase,
    db_session: AsyncSession,
) -> None:
    fake_supabase.with_next_uid(_TARGET_ID)
    resp = await admin_client.post(
        "/api/v1/admin/users/",
        json={"email": "new@test.com", "password": "Abcdef123!", "role": "manager"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "new@test.com"
    assert body["role"] == "manager"
    assert body["is_active"] is True
    assert body["temp_password"] == "Abcdef123!"

    row = (
        await db_session.execute(
            text("SELECT role, disabled_at FROM user_profiles WHERE user_id = :u"),
            {"u": str(_TARGET_ID)},
        )
    ).fetchone()
    assert row is not None
    assert row[0] == "manager"
    assert row[1] is None


@pytest.mark.asyncio
async def test_create_user_with_collaborator_link(
    admin_client: AsyncClient,
    fake_supabase: _FakeSupabase,
    db_session: AsyncSession,
) -> None:
    await db_session.execute(
        text(
            "INSERT INTO collaborators (full_name, aliases, is_active, created_at, updated_at) "
            "VALUES ('Alice', '[]', 1, :n, :n)"
        ),
        {"n": _NOW.isoformat()},
    )
    await db_session.commit()
    cid_row = (
        await db_session.execute(text("SELECT id FROM collaborators WHERE full_name='Alice'"))
    ).fetchone()
    assert cid_row is not None
    cid = cid_row[0]

    fake_supabase.with_next_uid(_TARGET_ID)
    resp = await admin_client.post(
        "/api/v1/admin/users/",
        json={
            "email": "alice@test.com",
            "password": "Abcdef123!",
            "role": "viewer",
            "collaborator_id": cid,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["collaborator_id"] == cid

    linked = (
        await db_session.execute(
            text("SELECT user_id FROM collaborators WHERE id = :id"),
            {"id": cid},
        )
    ).fetchone()
    assert linked is not None
    assert linked[0] == str(_TARGET_ID)


@pytest.mark.asyncio
async def test_create_user_viewer_forbidden(viewer_client: AsyncClient) -> None:
    resp = await viewer_client.post(
        "/api/v1/admin/users/",
        json={"email": "x@test.com", "password": "Abcdef123!", "role": "viewer"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_user_email_exists_rolls_back(
    admin_client: AsyncClient,
    fake_supabase: _FakeSupabase,
) -> None:
    fake_supabase.create_error = SupabaseAuthError(
        status_code=409, message="email_exists"
    )
    resp = await admin_client.post(
        "/api/v1/admin/users/",
        json={"email": "dup@test.com", "password": "Abcdef123!", "role": "viewer"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "email_exists"


# ---------------------------------------------------------------------------
# PATCH /{user_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_role_change(
    admin_client: AsyncClient,
    db_session: AsyncSession,
    patched_emails: dict[uuid.UUID, str],
) -> None:
    await _insert_profile(db_session, _TARGET_ID, role="viewer")
    patched_emails[_TARGET_ID] = "t@test.com"

    resp = await admin_client.patch(
        f"/api/v1/admin/users/{_TARGET_ID}",
        json={"role": "manager"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "manager"

    row = (
        await db_session.execute(
            text("SELECT role FROM user_profiles WHERE user_id = :u"),
            {"u": str(_TARGET_ID)},
        )
    ).fetchone()
    assert row is not None and row[0] == "manager"


@pytest.mark.asyncio
async def test_patch_disable_sets_disabled_at(
    admin_client: AsyncClient,
    db_session: AsyncSession,
    patched_emails: dict[uuid.UUID, str],
) -> None:
    await _insert_profile(db_session, _TARGET_ID, role="viewer")
    patched_emails[_TARGET_ID] = "t@test.com"

    resp = await admin_client.patch(
        f"/api/v1/admin/users/{_TARGET_ID}",
        json={"is_active": False},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is False

    row = (
        await db_session.execute(
            text("SELECT disabled_at FROM user_profiles WHERE user_id = :u"),
            {"u": str(_TARGET_ID)},
        )
    ).fetchone()
    assert row is not None and row[0] is not None


@pytest.mark.asyncio
async def test_patch_cannot_self_disable(admin_client: AsyncClient) -> None:
    resp = await admin_client.patch(
        f"/api/v1/admin/users/{_ADMIN_ID}",
        json={"is_active": False},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "cannot_disable_self"


@pytest.mark.asyncio
async def test_patch_cannot_demote_last_admin(
    db_session: AsyncSession,
    fake_supabase: _FakeSupabase,
    patched_emails: dict[uuid.UUID, str],
) -> None:
    await _insert_profile(db_session, _ADMIN_ID, role="admin")
    patched_emails[_ADMIN_ID] = "admin@test.com"

    # act as a manager to bypass self-modify guard
    manager_id = uuid.UUID("00000000-0000-0000-0000-0000000000aa")
    await _insert_profile(db_session, manager_id, role="manager")
    # require_role("admin") blocks manager; use a second admin as actor instead
    second_admin = uuid.UUID("00000000-0000-0000-0000-0000000000bb")
    await _insert_profile(db_session, second_admin, role="admin")
    patched_emails[second_admin] = "a2@test.com"

    # Now disable second_admin so only one active admin remains (_ADMIN_ID)
    await db_session.execute(
        text(
            "UPDATE user_profiles SET disabled_at = :n WHERE user_id = :u"
        ),
        {"n": _NOW.isoformat(), "u": str(second_admin)},
    )
    await db_session.commit()

    actor = _make_user(second_admin, role="admin")
    app = _make_admin_app(db_session, actor, fake_supabase)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            f"/api/v1/admin/users/{_ADMIN_ID}",
            json={"role": "viewer"},
        )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "last_admin"


# ---------------------------------------------------------------------------
# DELETE /{user_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_user_unlinks_and_deactivates_collaborator(
    admin_client: AsyncClient,
    db_session: AsyncSession,
    fake_supabase: _FakeSupabase,
    patched_emails: dict[uuid.UUID, str],
) -> None:
    await _insert_profile(db_session, _TARGET_ID, role="viewer")
    patched_emails[_TARGET_ID] = "t@test.com"
    await db_session.execute(
        text(
            "INSERT INTO collaborators (full_name, aliases, is_active, user_id, created_at, updated_at) "
            "VALUES ('Bob', '[]', 1, :uid, :n, :n)"
        ),
        {"uid": str(_TARGET_ID), "n": _NOW.isoformat()},
    )
    await db_session.commit()

    resp = await admin_client.delete(f"/api/v1/admin/users/{_TARGET_ID}")
    assert resp.status_code == 204, resp.text

    # Supabase admin delete called
    assert str(_TARGET_ID) in fake_supabase.deleted

    # Collaborator preserved but unlinked + deactivated
    row = (
        await db_session.execute(
            text("SELECT user_id, is_active FROM collaborators WHERE full_name = 'Bob'")
        )
    ).fetchone()
    assert row is not None
    assert row[0] is None
    assert bool(row[1]) is False


@pytest.mark.asyncio
async def test_delete_cannot_self_delete(admin_client: AsyncClient) -> None:
    resp = await admin_client.delete(f"/api/v1/admin/users/{_ADMIN_ID}")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "cannot_delete_self"


@pytest.mark.asyncio
async def test_delete_cannot_delete_last_admin(
    db_session: AsyncSession,
    fake_supabase: _FakeSupabase,
    patched_emails: dict[uuid.UUID, str],
) -> None:
    await _insert_profile(db_session, _ADMIN_ID, role="admin")
    lone_admin = uuid.UUID("00000000-0000-0000-0000-0000000000cc")
    await _insert_profile(db_session, lone_admin, role="admin")
    patched_emails[_ADMIN_ID] = "admin@test.com"
    patched_emails[lone_admin] = "lone@test.com"

    # Disable _ADMIN_ID so `lone_admin` is the only active admin
    await db_session.execute(
        text("UPDATE user_profiles SET disabled_at = :n WHERE user_id = :u"),
        {"n": _NOW.isoformat(), "u": str(_ADMIN_ID)},
    )
    await db_session.commit()

    actor = _make_user(_ADMIN_ID, role="admin")  # disabled in DB but deps-overridden
    app = _make_admin_app(db_session, actor, fake_supabase)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete(f"/api/v1/admin/users/{lone_admin}")

    assert resp.status_code == 409
    assert resp.json()["detail"] == "last_admin"
    assert fake_supabase.deleted == []

"""Unit tests for deps/auth.py.

Uses an in-memory aiosqlite DB for UserProfile lookups. The get_session
dependency is overridden with a stub AsyncSession whose scalar() method
intercepts UserProfile queries and routes them to a raw SQLite table
(bypassing the `public.` schema prefix that SQLite does not support).

verify_access_token is monkey-patched on app.deps.auth per test so that
the actual JWT / JWKS logic is never invoked.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.deps.auth as _deps_auth
from app.core.security import AccessTokenClaims, JWTExpiredError, JWTValidationError
from app.db.models.user_profile import UserProfile
from app.deps.auth import (
    AuthenticatedUser,
    get_current_user,
    get_supabase_auth,
    require_role,
)
from app.deps.db import get_session
from app.services.supabase_auth import SupabaseAuthClient, SupabaseAuthError, TokenResponse

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
_TEST_EMAIL = "admin@test.com"
_FAKE_ACCESS = "fake.access.token"
_FAKE_REFRESH = "fake.refresh.token"
_FAKE_NEW_ACCESS = "fake.new.access.token"
_FAKE_NEW_REFRESH = "fake.new.refresh.token"

_NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def _make_claims(sub: UUID = _TEST_USER_ID, email: str = _TEST_EMAIL) -> AccessTokenClaims:
    return AccessTokenClaims(
        sub=sub,
        email=email,
        aud="authenticated",
        iss="https://example.supabase.co/auth/v1",
        exp=9999999999,
        iat=1700000000,
        app_metadata={},
        session_id=None,
    )


def _make_token_response(
    access: str = _FAKE_NEW_ACCESS,
    refresh: str = _FAKE_NEW_REFRESH,
) -> TokenResponse:
    from app.services.supabase_auth import SupabaseUser

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        expires_in=3600,
        expires_at=None,
        user=SupabaseUser(id=_TEST_USER_ID, email=_TEST_EMAIL),
    )


class _StubSupabase:
    """Minimal SupabaseAuthClient stub for tests."""

    def __init__(self, refresh_impl: Any) -> None:
        self._refresh_impl = refresh_impl

    async def refresh_session(self, refresh_token: str) -> TokenResponse:
        return await self._refresh_impl(refresh_token)


# ---------------------------------------------------------------------------
# In-memory SQLite DB fixture
# ---------------------------------------------------------------------------

# We cannot use SQLAlchemy ORM's select(UserProfile) directly in SQLite
# because UserProfile.__table_args__ includes schema="public" which SQLite
# does not support.  Instead we create a plain table and override get_session
# with a stub session that returns UserProfile instances populated from raw
# SQLite rows.


class _ProfileStub:
    """Lightweight stand-in for UserProfile that matches the attribute surface
    consumed by get_current_user (user_id, role, created_at, disabled_at).

    Using a plain object avoids SQLAlchemy instrumentation errors that occur
    when constructing an ORM model with ``__new__`` outside of a session.
    """

    def __init__(
        self,
        *,
        user_id: UUID,
        role: str,
        created_at: datetime,
        disabled_at: datetime | None,
    ) -> None:
        self.user_id = user_id
        self.role = role
        self.created_at = created_at
        self.disabled_at = disabled_at


class _SqliteSessionStub:
    """Thin wrapper that exposes only the scalar() surface used by get_current_user.

    Routes select(UserProfile).where(user_id == ...) to a raw SQLite query
    on a table WITHOUT the public schema prefix, then returns a _ProfileStub
    instead of a real SQLAlchemy ORM instance.
    """

    def __init__(self, raw_session: AsyncSession) -> None:
        self._s = raw_session

    async def scalar(self, stmt: Any) -> _ProfileStub | None:
        # Extract the user_id from the WHERE clause (the only callers send
        # select(UserProfile).where(UserProfile.user_id == <uuid>)).
        # We pull the bound parameter value out of the compiled clause.
        compiled = stmt.whereclause
        user_id_val: UUID | None = None
        try:
            user_id_val = compiled.right.value  # type: ignore[union-attr]
        except AttributeError:
            pass

        if user_id_val is None:
            return None

        row = (
            await self._s.execute(
                text(
                    "SELECT user_id, role, created_at, updated_at, disabled_at "
                    "FROM user_profiles WHERE user_id = :uid"
                ),
                {"uid": str(user_id_val)},
            )
        ).fetchone()

        if row is None:
            return None

        return _ProfileStub(
            user_id=uuid.UUID(row[0]),
            role=row[1],
            created_at=_parse_dt(row[2]),
            disabled_at=_parse_dt(row[4]) if row[4] else None,
        )


def _parse_dt(value: str) -> datetime:
    """Parse ISO 8601 datetime string into a timezone-aware datetime."""
    if value.endswith("+00:00"):
        return datetime.fromisoformat(value)
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


@pytest.fixture()
async def raw_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    disabled_at TEXT
                )
                """
            )
        )
    yield engine
    await engine.dispose()


@pytest.fixture()
async def db_session(raw_engine):
    maker = async_sessionmaker(raw_engine, expire_on_commit=False)
    async with maker() as session:
        yield session


async def _insert_profile(
    session: AsyncSession,
    *,
    user_id: UUID = _TEST_USER_ID,
    role: str = "admin",
    disabled_at: str | None = None,
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
            "da": disabled_at,
        },
    )
    await session.commit()


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def _make_app(
    *,
    verify_impl: Any,
    supabase_stub: Any,
    db_session: AsyncSession,
    endpoint_dep: Any = None,
) -> FastAPI:
    """Build a minimal FastAPI app with overridden dependencies."""
    test_app = FastAPI()

    dep = endpoint_dep if endpoint_dep is not None else get_current_user

    @test_app.get("/me")
    async def _me(user: AuthenticatedUser = Depends(dep)) -> dict[str, Any]:
        return {"id": str(user.id), "email": user.email, "role": user.role}

    # Patch verify_access_token at the module level (the closure imported by
    # get_current_user).  Each test supplies its own coroutine function.
    _deps_auth.verify_access_token = verify_impl  # type: ignore[attr-defined]

    stub_session = _SqliteSessionStub(db_session)

    async def _session_dep() -> Any:  # type: ignore[return]
        yield stub_session  # type: ignore[misc]

    test_app.dependency_overrides[get_supabase_auth] = lambda: supabase_stub
    test_app.dependency_overrides[get_session] = _session_dep

    return test_app


# ---------------------------------------------------------------------------
# Helper to extract Set-Cookie header values from an httpx Response
# ---------------------------------------------------------------------------


def _set_cookie_values(resp: Any) -> list[str]:
    return [v for k, v in resp.headers.items() if k.lower() == "set-cookie"]


# ---------------------------------------------------------------------------
# Test 1: missing cookies -> 401 + clear-cookie headers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_cookies_returns_401(db_session: AsyncSession) -> None:
    async def _verify(token: str) -> AccessTokenClaims:
        raise AssertionError("should not be called")

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me")

    assert resp.status_code == 401
    assert resp.json()["detail"] == "not_authenticated"
    sc = _set_cookie_values(resp)
    # HTTPException.headers injects a single set-cookie with both directives.
    combined = " ".join(sc)
    assert "sb_access" in combined
    assert "sb_refresh" in combined


# ---------------------------------------------------------------------------
# Test 2: valid token -> 200 with user info
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_returns_user(db_session: AsyncSession) -> None:
    await _insert_profile(db_session, role="admin")

    async def _verify(token: str) -> AccessTokenClaims:
        assert token == _FAKE_ACCESS
        return _make_claims()

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == _TEST_EMAIL
    assert body["role"] == "admin"
    assert body["id"] == str(_TEST_USER_ID)


# ---------------------------------------------------------------------------
# Test 3: expired token with refresh cookie -> auto-refresh, new Set-Cookie
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_token_refreshes_successfully(db_session: AsyncSession) -> None:
    await _insert_profile(db_session, role="manager")

    call_count = {"n": 0}

    async def _verify(token: str) -> AccessTokenClaims:
        if call_count["n"] == 0:
            call_count["n"] += 1
            raise JWTExpiredError("expired")
        assert token == _FAKE_NEW_ACCESS
        return _make_claims()

    async def _refresh(refresh_token: str) -> TokenResponse:
        assert refresh_token == _FAKE_REFRESH
        return _make_token_response()

    stub = _StubSupabase(refresh_impl=_refresh)
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/me",
            cookies={"sb_access": _FAKE_ACCESS, "sb_refresh": _FAKE_REFRESH},
        )

    assert resp.status_code == 200
    sc = _set_cookie_values(resp)
    combined = " ".join(sc)
    assert _FAKE_NEW_ACCESS in combined, f"New access token not in Set-Cookie: {sc}"
    assert _FAKE_NEW_REFRESH in combined, f"New refresh token not in Set-Cookie: {sc}"


# ---------------------------------------------------------------------------
# Test 4: expired token without refresh cookie -> 401, cookies cleared
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_token_without_refresh_cookie_returns_401(
    db_session: AsyncSession,
) -> None:
    async def _verify(token: str) -> AccessTokenClaims:
        raise JWTExpiredError("expired")

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "not_authenticated"
    combined = " ".join(_set_cookie_values(resp))
    assert "sb_access" in combined


# ---------------------------------------------------------------------------
# Test 5: refresh failure -> 401, cookies cleared
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_failure_returns_401(db_session: AsyncSession) -> None:
    async def _verify(token: str) -> AccessTokenClaims:
        raise JWTExpiredError("expired")

    async def _refresh(refresh_token: str) -> TokenResponse:
        raise SupabaseAuthError(status_code=401, message="invalid_credentials")

    stub = _StubSupabase(refresh_impl=_refresh)
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/me",
            cookies={"sb_access": _FAKE_ACCESS, "sb_refresh": _FAKE_REFRESH},
        )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "not_authenticated"
    combined = " ".join(_set_cookie_values(resp))
    assert "sb_access" in combined


# ---------------------------------------------------------------------------
# Test 6: invalid (non-expired) token -> 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_token_returns_401(db_session: AsyncSession) -> None:
    async def _verify(token: str) -> AccessTokenClaims:
        raise JWTValidationError("bad_signature")

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "not_authenticated"


# ---------------------------------------------------------------------------
# Test 7: profile missing -> 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_profile_missing_returns_403(db_session: AsyncSession) -> None:
    # No profile row inserted.

    async def _verify(token: str) -> AccessTokenClaims:
        return _make_claims()

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "forbidden"


# ---------------------------------------------------------------------------
# Test 8: profile disabled -> 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_profile_disabled_returns_403(db_session: AsyncSession) -> None:
    await _insert_profile(
        db_session,
        role="viewer",
        disabled_at="2025-01-01T00:00:00+00:00",
    )

    async def _verify(token: str) -> AccessTokenClaims:
        return _make_claims()

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(verify_impl=_verify, supabase_stub=stub, db_session=db_session)

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "forbidden"


# ---------------------------------------------------------------------------
# Test 9: require_role admin allows admin
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_role_admin_allows_admin(db_session: AsyncSession) -> None:
    await _insert_profile(db_session, role="admin")

    async def _verify(token: str) -> AccessTokenClaims:
        return _make_claims()

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(
        verify_impl=_verify,
        supabase_stub=stub,
        db_session=db_session,
        endpoint_dep=require_role("admin"),
    )

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


# ---------------------------------------------------------------------------
# Test 10: require_role admin blocks viewer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_role_admin_blocks_viewer(db_session: AsyncSession) -> None:
    viewer_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    await _insert_profile(db_session, user_id=viewer_id, role="viewer")

    async def _verify(token: str) -> AccessTokenClaims:
        return _make_claims(sub=viewer_id)

    stub = _StubSupabase(refresh_impl=AsyncMock())
    app_ = _make_app(
        verify_impl=_verify,
        supabase_stub=stub,
        db_session=db_session,
        endpoint_dep=require_role("admin"),
    )

    transport = ASGITransport(app=app_)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/me", cookies={"sb_access": _FAKE_ACCESS})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "forbidden"

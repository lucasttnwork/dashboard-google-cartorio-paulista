"""Integration tests for app/api/v1/auth.py endpoints.

Uses pytest-asyncio + httpx.AsyncClient with ASGITransport.  All external
dependencies (Supabase, Redis/rate-limiter, DB) are stubbed via
dependency_overrides so no network calls are made.

In-memory aiosqlite is used for the UserProfile DB lookups performed
inside /login and /refresh.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1 import auth as auth_module
from app.deps.auth import (
    AuthenticatedUser,
    get_current_user,
    get_rate_limiter,
    get_supabase_auth,
)
from app.deps.db import get_session
from app.services.rate_limit import LockoutState, RateLimitResult
from app.services.supabase_auth import SupabaseAuthError, SupabaseUser, TokenResponse

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
_EMAIL = "user@test.com"
_FAKE_ACCESS = "fake.access.token"
_FAKE_REFRESH = "fake.refresh.token"
_NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def _make_supabase_user(uid: UUID = _USER_ID, email: str = _EMAIL) -> SupabaseUser:
    return SupabaseUser(id=uid, email=email)


def _make_token_response(
    uid: UUID = _USER_ID,
    email: str = _EMAIL,
    expires_at: int | None = 9999999999,
) -> TokenResponse:
    return TokenResponse(
        access_token=_FAKE_ACCESS,
        refresh_token=_FAKE_REFRESH,
        token_type="bearer",
        expires_in=3600,
        expires_at=expires_at,
        user=_make_supabase_user(uid, email),
    )


def _make_authenticated_user(
    uid: UUID = _USER_ID,
    role: str = "admin",
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=uid,
        email=_EMAIL,
        role=role,  # type: ignore[arg-type]
        created_at=_NOW,
        disabled_at=None,
    )


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------


class _FakeSupabase:
    """Controllable SupabaseAuthClient stub."""

    def __init__(self) -> None:
        self.calls: dict[str, list[Any]] = {
            "sign_in": [],
            "refresh": [],
            "sign_out": [],
            "recover": [],
            "update_password": [],
        }
        # Defaults — tests override per-case.
        self.sign_in_result: TokenResponse | Exception = _make_token_response()
        self.refresh_result: TokenResponse | Exception = _make_token_response()
        self.sign_out_raises: Exception | None = None
        self.recover_raises: Exception | None = None
        self.update_password_result: SupabaseUser | Exception = _make_supabase_user()
        self.admin_update_password_result: SupabaseUser | Exception = (
            _make_supabase_user()
        )
        self.calls.setdefault("admin_update_password", [])

    async def sign_in_with_password(self, email: str, password: str) -> TokenResponse:
        self.calls["sign_in"].append((email, password))
        if isinstance(self.sign_in_result, Exception):
            raise self.sign_in_result
        return self.sign_in_result

    async def refresh_session(self, refresh_token: str) -> TokenResponse:
        self.calls["refresh"].append(refresh_token)
        if isinstance(self.refresh_result, Exception):
            raise self.refresh_result
        return self.refresh_result

    async def sign_out(self, access_token: str, *, scope: str = "local") -> None:
        self.calls["sign_out"].append((access_token, scope))
        if self.sign_out_raises is not None:
            raise self.sign_out_raises

    async def recover_password(self, email: str) -> None:
        self.calls["recover"].append(email)
        if self.recover_raises is not None:
            raise self.recover_raises

    async def update_user_password(
        self, access_token: str, new_password: str
    ) -> SupabaseUser:
        self.calls["update_password"].append((access_token, new_password))
        if isinstance(self.update_password_result, Exception):
            raise self.update_password_result
        return self.update_password_result

    async def admin_update_user_password(
        self,
        user_id: Any,
        new_password: str,
        *,
        app_metadata: dict[str, Any] | None = None,
    ) -> SupabaseUser:
        self.calls["admin_update_password"].append(
            (str(user_id), new_password, app_metadata)
        )
        if isinstance(self.admin_update_password_result, Exception):
            raise self.admin_update_password_result
        return self.admin_update_password_result


# ---------------------------------------------------------------------------
# Fake rate limiter
# ---------------------------------------------------------------------------


class _FakeLimiter:
    """Controllable RateLimiter stub."""

    def __init__(self) -> None:
        self.hit_result: RateLimitResult = RateLimitResult(
            allowed=True, remaining=4, retry_after_seconds=0, current_count=1
        )
        self.lockout_result: LockoutState = LockoutState(level=0, locked_until=None)
        self.record_failure_calls: list[Any] = []
        self.clear_lockout_calls: list[str] = []

    async def hit(self, key: str, *, max_attempts: int, window_seconds: int) -> RateLimitResult:
        return self.hit_result

    async def lockout_status(self, key: str) -> LockoutState:
        return self.lockout_result

    async def record_failure(self, key: str, *, steps: list[int]) -> LockoutState:
        self.record_failure_calls.append(key)
        return LockoutState(level=1, locked_until=datetime.now(timezone.utc) + timedelta(seconds=900))

    async def clear_lockout(self, key: str) -> None:
        self.clear_lockout_calls.append(key)


# ---------------------------------------------------------------------------
# In-memory SQLite DB fixture
# ---------------------------------------------------------------------------


class _ProfileStub:
    """Lightweight stand-in for UserProfile (mirrors test_deps_auth.py approach)."""

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
    """Thin AsyncSession wrapper routing UserProfile lookups to SQLite."""

    def __init__(self, raw_session: AsyncSession) -> None:
        self._s = raw_session

    async def scalar(self, stmt: Any) -> _ProfileStub | None:
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
                    "SELECT user_id, role, created_at, disabled_at "
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
            disabled_at=_parse_dt(row[3]) if row[3] else None,
        )


def _parse_dt(value: str) -> datetime:
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
                    disabled_at TEXT
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_type  TEXT NOT NULL,
                    entity_id    INTEGER NOT NULL,
                    action       TEXT NOT NULL,
                    actor_id     TEXT NOT NULL,
                    actor_email  TEXT NOT NULL,
                    diff         TEXT NOT NULL DEFAULT '{}',
                    created_at   TEXT NOT NULL
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
    user_id: UUID = _USER_ID,
    role: str = "admin",
    disabled_at: str | None = None,
) -> None:
    await session.execute(
        text(
            "INSERT INTO user_profiles (user_id, role, created_at, disabled_at) "
            "VALUES (:uid, :role, :ca, :da)"
        ),
        {
            "uid": str(user_id),
            "role": role,
            "ca": _NOW.isoformat(),
            "da": disabled_at,
        },
    )
    await session.commit()


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def _make_app(
    *,
    supabase: _FakeSupabase | None = None,
    limiter: _FakeLimiter | None = None,
    db_session: AsyncSession | None = None,
    override_current_user: Any = None,
) -> FastAPI:
    """Build a minimal FastAPI app with auth router wired."""
    test_app = FastAPI()
    test_app.include_router(auth_module.router, prefix="/api/v1/auth")
    test_app.include_router(auth_module.debug_router, prefix="/api/v1")

    if supabase is not None:
        test_app.dependency_overrides[get_supabase_auth] = lambda: supabase

    if limiter is not None:
        test_app.dependency_overrides[get_rate_limiter] = lambda: limiter

    if db_session is not None:
        stub_session = _SqliteSessionStub(db_session)

        async def _session_dep() -> Any:  # type: ignore[return]
            yield stub_session

        test_app.dependency_overrides[get_session] = _session_dep

    if override_current_user is not None:
        test_app.dependency_overrides[get_current_user] = override_current_user

    return test_app


def _set_cookie_values(resp: Any) -> list[str]:
    return [v for k, v in resp.headers.items() if k.lower() == "set-cookie"]


# ---------------------------------------------------------------------------
# Test 1: login happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_happy_path(db_session: AsyncSession) -> None:
    await _insert_profile(db_session, role="admin")
    sb = _FakeSupabase()
    lim = _FakeLimiter()
    app = _make_app(supabase=sb, limiter=lim, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": _EMAIL, "password": "secret123"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["email"] == _EMAIL
    assert body["user"]["role"] == "admin"
    assert body["expires_at"] == 9999999999

    sc = _set_cookie_values(resp)
    combined = " ".join(sc)
    assert "sb_access" in combined
    assert "sb_refresh" in combined
    assert lim.clear_lockout_calls, "clear_lockout must be called on success"


# ---------------------------------------------------------------------------
# Test 2: invalid credentials -> 401, record_failure called
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_invalid_credentials(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    sb.sign_in_result = SupabaseAuthError(status_code=401, message="invalid_credentials")
    lim = _FakeLimiter()
    app = _make_app(supabase=sb, limiter=lim, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": _EMAIL, "password": "wrong"},
        )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_credentials"
    assert lim.record_failure_calls, "record_failure must be called on 401"


# ---------------------------------------------------------------------------
# Test 3: rate-limited by sliding window -> 429
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_rate_limited_by_window(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    lim = _FakeLimiter()
    lim.hit_result = RateLimitResult(
        allowed=False, remaining=0, retry_after_seconds=300, current_count=6
    )
    app = _make_app(supabase=sb, limiter=lim, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": _EMAIL, "password": "x"},
        )

    assert resp.status_code == 429
    assert resp.json()["detail"] == "rate_limited"
    assert resp.headers.get("retry-after") == "300"
    assert not sb.calls["sign_in"], "supabase must NOT be called when rate limited"


# ---------------------------------------------------------------------------
# Test 4: locked out -> 429, supabase not called
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_locked_out(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    lim = _FakeLimiter()
    future = datetime.now(timezone.utc) + timedelta(seconds=900)
    lim.lockout_result = LockoutState(level=2, locked_until=future)
    app = _make_app(supabase=sb, limiter=lim, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": _EMAIL, "password": "x"},
        )

    assert resp.status_code == 429
    assert resp.json()["detail"] == "too_many_attempts"
    retry = int(resp.headers["retry-after"])
    assert retry >= 1
    assert not sb.calls["sign_in"], "supabase must NOT be called when locked out"


# ---------------------------------------------------------------------------
# Test 5: valid supabase response but no user_profile -> 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_user_profile_missing_returns_403(db_session: AsyncSession) -> None:
    # No profile row inserted.
    sb = _FakeSupabase()
    lim = _FakeLimiter()
    app = _make_app(supabase=sb, limiter=lim, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": _EMAIL, "password": "secret"},
        )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "forbidden"
    # Cookies must be cleared.
    sc = _set_cookie_values(resp)
    combined = " ".join(sc)
    assert "Max-Age=0" in combined or "max-age=0" in combined.lower()


# ---------------------------------------------------------------------------
# Test 6: logout clears cookies and calls sign_out
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_clears_cookies(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    app = _make_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/logout",
            cookies={"sb_access": _FAKE_ACCESS},
        )

    assert resp.status_code == 204
    assert sb.calls["sign_out"], "sign_out must be called when access cookie present"
    sc = _set_cookie_values(resp)
    combined = " ".join(sc)
    assert "sb_access" in combined
    assert "sb_refresh" in combined


# ---------------------------------------------------------------------------
# Test 7: logout without session still returns 204
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_without_session_still_204(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    app = _make_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/logout")

    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Test 8: GET /me returns authenticated user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_returns_authenticated_user() -> None:
    async def _fake_user() -> AuthenticatedUser:
        return _make_authenticated_user(role="manager")

    app = _make_app(override_current_user=_fake_user)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me")

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == _EMAIL
    assert body["role"] == "manager"
    assert body["id"] == str(_USER_ID)


# ---------------------------------------------------------------------------
# Test 9: GET /me without session -> 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_without_session_401() -> None:
    from fastapi import HTTPException

    async def _fail_user() -> AuthenticatedUser:
        raise HTTPException(status_code=401, detail="not_authenticated")

    app = _make_app(override_current_user=_fail_user)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me")

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test 10: refresh happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_happy_path(db_session: AsyncSession) -> None:
    await _insert_profile(db_session, role="viewer")
    sb = _FakeSupabase()
    app = _make_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/refresh",
            cookies={"sb_refresh": _FAKE_REFRESH},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["role"] == "viewer"
    sc = _set_cookie_values(resp)
    combined = " ".join(sc)
    assert "sb_access" in combined


# ---------------------------------------------------------------------------
# Test 11: refresh without cookie -> 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_no_cookie_401(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    app = _make_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/refresh")

    assert resp.status_code == 401
    assert resp.json()["detail"] == "not_authenticated"


# ---------------------------------------------------------------------------
# Test 12: refresh with upstream error -> 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_upstream_error_401(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    sb.refresh_result = SupabaseAuthError(status_code=401, message="invalid_credentials")
    app = _make_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/refresh",
            cookies={"sb_refresh": _FAKE_REFRESH},
        )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "not_authenticated"


# ---------------------------------------------------------------------------
# Test 13: forgot always returns 200 even on upstream error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_returns_200_even_on_error() -> None:
    sb = _FakeSupabase()
    sb.recover_raises = SupabaseAuthError(status_code=404, message="user_not_found")
    lim = _FakeLimiter()
    app = _make_app(supabase=sb, limiter=lim)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/forgot",
            json={"email": _EMAIL},
        )

    assert resp.status_code == 200
    assert resp.json() == {}


# ---------------------------------------------------------------------------
# Test 14: forgot returns 200 even on rate limit (anti-enumeration)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_returns_200_even_on_rate_limit() -> None:
    sb = _FakeSupabase()
    lim = _FakeLimiter()
    lim.hit_result = RateLimitResult(
        allowed=False, remaining=0, retry_after_seconds=300, current_count=2
    )
    app = _make_app(supabase=sb, limiter=lim)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/forgot",
            json={"email": _EMAIL},
        )

    assert resp.status_code == 200
    assert resp.json() == {}
    assert not sb.calls["recover"], "supabase must NOT be called when rate limited"


# ---------------------------------------------------------------------------
# Test 15: reset happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_happy_path() -> None:
    sb = _FakeSupabase()
    app = _make_app(supabase=sb)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/reset",
            json={"access_token": "recovery.token", "password": "NewPass123!"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ---------------------------------------------------------------------------
# Test 16: reset with invalid token -> 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_invalid_token_401() -> None:
    sb = _FakeSupabase()
    sb.update_password_result = SupabaseAuthError(status_code=401, message="invalid_credentials")
    app = _make_app(supabase=sb)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/reset",
            json={"access_token": "bad.token", "password": "NewPass123!"},
        )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_credentials"


# ---------------------------------------------------------------------------
# Test 17: _debug/admin-only allows admin
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_debug_admin_only_allows_admin() -> None:
    async def _admin_user() -> AuthenticatedUser:
        return _make_authenticated_user(role="admin")

    app = _make_app(override_current_user=_admin_user)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/_debug/admin-only")

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["role"] == "admin"


# ---------------------------------------------------------------------------
# Test 18: _debug/admin-only blocks viewer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_debug_admin_only_blocks_viewer() -> None:
    async def _viewer_user() -> AuthenticatedUser:
        return _make_authenticated_user(role="viewer")

    app = _make_app(override_current_user=_viewer_user)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/_debug/admin-only")

    assert resp.status_code == 403
    assert resp.json()["detail"] == "forbidden"


# ---------------------------------------------------------------------------
# Change-password tests
# ---------------------------------------------------------------------------


def _change_password_app(
    *,
    supabase: _FakeSupabase,
    db_session: AsyncSession,
    user: AuthenticatedUser | None = None,
) -> FastAPI:
    """Build an app with a real AsyncSession wired for change-password."""
    test_app = FastAPI()
    test_app.include_router(auth_module.router, prefix="/api/v1/auth")
    test_app.dependency_overrides[get_supabase_auth] = lambda: supabase

    async def _session_dep() -> Any:  # type: ignore[return]
        yield db_session

    test_app.dependency_overrides[get_session] = _session_dep

    if user is None:
        user = _make_authenticated_user(role="viewer")
    _user = user

    async def _user_dep() -> AuthenticatedUser:
        return _user

    test_app.dependency_overrides[get_current_user] = _user_dep
    return test_app


@pytest.mark.asyncio
async def test_change_password_happy_path(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    app = _change_password_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "old-secret", "new_password": "NewStrong123!"},
        )

    assert resp.status_code == 204
    # Two sign_in calls: verify current pwd, then re-auth with new pwd to
    # mint a fresh JWT whose app_metadata carries the cleared flag.
    assert sb.calls["sign_in"] == [
        (_EMAIL, "old-secret"),
        (_EMAIL, "NewStrong123!"),
    ]
    assert len(sb.calls["admin_update_password"]) == 1
    call = sb.calls["admin_update_password"][0]
    assert call[0] == str(_USER_ID)
    assert call[1] == "NewStrong123!"
    assert call[2] == {"must_change_password": False}

    # Fresh session cookies must be set on 204 response.
    set_cookies = _set_cookie_values(resp)
    combined = " ".join(set_cookies)
    assert "sb_access" in combined
    assert "sb_refresh" in combined

    # Audit row written — password not present in diff.
    row = (
        await db_session.execute(
            text("SELECT action, actor_id, diff FROM audit_log")
        )
    ).fetchone()
    assert row is not None
    assert row[0] == "update"
    assert "NewStrong123!" not in (row[2] or "")
    assert "password_changed" in (row[2] or "")


@pytest.mark.asyncio
async def test_change_password_wrong_current(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    sb.sign_in_result = SupabaseAuthError(
        status_code=401, message="invalid_credentials"
    )
    app = _change_password_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "bad", "new_password": "NewStrong123!"},
        )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_current_password"
    assert not sb.calls["admin_update_password"]


@pytest.mark.asyncio
async def test_change_password_weak_new(db_session: AsyncSession) -> None:
    sb = _FakeSupabase()
    sb.admin_update_password_result = SupabaseAuthError(
        status_code=400, message="weak_password"
    )
    app = _change_password_app(supabase=sb, db_session=db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "old-secret", "new_password": "weakpass"},
        )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "weak_password"


@pytest.mark.asyncio
async def test_change_password_unauthenticated(db_session: AsyncSession) -> None:
    from fastapi import HTTPException

    sb = _FakeSupabase()
    test_app = FastAPI()
    test_app.include_router(auth_module.router, prefix="/api/v1/auth")
    test_app.dependency_overrides[get_supabase_auth] = lambda: sb

    async def _session_dep() -> Any:  # type: ignore[return]
        yield db_session

    test_app.dependency_overrides[get_session] = _session_dep

    async def _fail_user() -> AuthenticatedUser:
        raise HTTPException(status_code=401, detail="not_authenticated")

    test_app.dependency_overrides[get_current_user] = _fail_user

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "x", "new_password": "NewStrong123!"},
        )

    assert resp.status_code == 401
    assert not sb.calls["sign_in"]

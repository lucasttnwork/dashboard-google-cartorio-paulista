"""Unit tests for scripts/bootstrap_admin.py (T1.W2.7).

Tests cover helpers and async core functions via imports.
No real Supabase calls, no real Postgres — fully isolated.
pytest-asyncio is in auto mode (see pyproject.toml).
"""

from __future__ import annotations

import pytest
from uuid import UUID
from typing import Any

from app.services.supabase_auth import SupabaseAuthError, SupabaseUser
from scripts.bootstrap_admin import (
    _read_env_or_fail,
    _validate_password,
    _validate_role,
    ensure_supabase_user,
)


# ---------------------------------------------------------------------------
# Minimal fake SupabaseAuthClient
# ---------------------------------------------------------------------------


class _FakeSupabase:
    def __init__(self, create_impl=None, get_impl=None):
        self._create = create_impl
        self._get = get_impl

    async def admin_create_user(
        self,
        email: str,
        password: str,
        *,
        email_confirm: bool = True,
        app_metadata: dict[str, Any] | None = None,
    ) -> SupabaseUser:
        if self._create is None:
            raise AssertionError("admin_create_user not mocked")
        return await self._create(email, password, email_confirm, app_metadata)

    async def admin_get_user_by_email(self, email: str) -> SupabaseUser | None:
        if self._get is None:
            return None
        return await self._get(email)


# ---------------------------------------------------------------------------
# _validate_role
# ---------------------------------------------------------------------------


def test_validate_role_happy():
    assert _validate_role("admin") == "admin"
    assert _validate_role("manager") == "manager"
    assert _validate_role("viewer") == "viewer"


def test_validate_role_invalid_exits_2():
    with pytest.raises(SystemExit) as exc_info:
        _validate_role("superadmin")
    assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# _validate_password
# ---------------------------------------------------------------------------


def test_validate_password_too_short():
    with pytest.raises(SystemExit) as exc_info:
        _validate_password("short7")  # 6 chars — under limit
    assert exc_info.value.code == 2


def test_validate_password_exactly_8_passes():
    # Should not raise
    _validate_password("exactly8")


# ---------------------------------------------------------------------------
# _read_env_or_fail
# ---------------------------------------------------------------------------


def test_read_env_or_fail_present(monkeypatch):
    monkeypatch.setenv("TEST_VAR_BOOTSTRAP", "bar")
    assert _read_env_or_fail("TEST_VAR_BOOTSTRAP") == "bar"


def test_read_env_or_fail_missing_exits_2(monkeypatch):
    monkeypatch.delenv("TEST_VAR_BOOTSTRAP_MISSING", raising=False)
    with pytest.raises(SystemExit) as exc_info:
        _read_env_or_fail("TEST_VAR_BOOTSTRAP_MISSING")
    assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# ensure_supabase_user — dry_run
# ---------------------------------------------------------------------------


async def test_ensure_supabase_user_dry_run_returns_stub():
    """dry_run=True must return the zero-UUID stub without touching the client."""
    called = []

    async def create_impl(email, password, email_confirm, app_metadata):
        called.append("create")
        raise AssertionError("should not be called in dry-run")

    fake = _FakeSupabase(create_impl=create_impl)
    user = await ensure_supabase_user(
        fake,  # type: ignore[arg-type]
        email="admin@example.com",
        password="irrelevant",
        dry_run=True,
    )

    assert user.id == UUID("00000000-0000-0000-0000-000000000000")
    assert user.email == "admin@example.com"
    assert called == []


# ---------------------------------------------------------------------------
# ensure_supabase_user — happy path create
# ---------------------------------------------------------------------------


async def test_ensure_supabase_user_create_happy_path():
    expected_user = SupabaseUser(
        id=UUID("11111111-1111-1111-1111-111111111111"),
        email="new@example.com",
    )

    async def create_impl(email, password, email_confirm, app_metadata):
        return expected_user

    fake = _FakeSupabase(create_impl=create_impl)
    user = await ensure_supabase_user(
        fake,  # type: ignore[arg-type]
        email="new@example.com",
        password="strongpass",
        dry_run=False,
    )

    assert user is expected_user


# ---------------------------------------------------------------------------
# ensure_supabase_user — email_exists falls back to lookup
# ---------------------------------------------------------------------------


async def test_ensure_supabase_user_email_exists_falls_back_to_lookup():
    existing_user = SupabaseUser(
        id=UUID("22222222-2222-2222-2222-222222222222"),
        email="existing@example.com",
    )

    async def create_impl(email, password, email_confirm, app_metadata):
        raise SupabaseAuthError(status_code=409, message="email_exists")

    async def get_impl(email):
        return existing_user

    fake = _FakeSupabase(create_impl=create_impl, get_impl=get_impl)
    user = await ensure_supabase_user(
        fake,  # type: ignore[arg-type]
        email="existing@example.com",
        password="strongpass",
        dry_run=False,
    )

    assert user is existing_user


# ---------------------------------------------------------------------------
# ensure_supabase_user — email_exists but lookup returns None → exit 3
# ---------------------------------------------------------------------------


async def test_ensure_supabase_user_email_exists_lookup_returns_none_exits_3():
    async def create_impl(email, password, email_confirm, app_metadata):
        raise SupabaseAuthError(status_code=409, message="email_exists")

    # get_impl returns None (default)
    fake = _FakeSupabase(create_impl=create_impl)

    with pytest.raises(SystemExit) as exc_info:
        await ensure_supabase_user(
            fake,  # type: ignore[arg-type]
            email="ghost@example.com",
            password="strongpass",
            dry_run=False,
        )

    assert exc_info.value.code == 3


# ---------------------------------------------------------------------------
# ensure_supabase_user — unexpected error re-raises
# ---------------------------------------------------------------------------


async def test_ensure_supabase_user_unexpected_error_reraises():
    """Non-409 SupabaseAuthError must propagate — main() handles it."""

    async def create_impl(email, password, email_confirm, app_metadata):
        raise SupabaseAuthError(status_code=401, message="invalid_credentials")

    fake = _FakeSupabase(create_impl=create_impl)

    with pytest.raises(SupabaseAuthError) as exc_info:
        await ensure_supabase_user(
            fake,  # type: ignore[arg-type]
            email="bad@example.com",
            password="wrongpass",
            dry_run=False,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.message == "invalid_credentials"

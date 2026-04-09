"""Unit tests for SupabaseAuthClient (T1.W2.3).

Uses respx to intercept httpx calls — no real network traffic.
pytest-asyncio is in auto mode (configured in pyproject.toml).
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import respx

from app.services.supabase_auth import (
    SupabaseAuthClient,
    SupabaseAuthError,
    TokenResponse,
    SupabaseUser,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://test.supabase.co/auth/v1"
SECRET_KEY = "sb_secret_test_value"

_USER_PAYLOAD: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "user@example.com",
    "phone": None,
    "app_metadata": {},
    "user_metadata": {},
    "aud": "authenticated",
    "role": "authenticated",
    "created_at": "2024-01-01T00:00:00.000Z",
}

_TOKEN_PAYLOAD: dict[str, Any] = {
    "access_token": "eyJaccess",
    "refresh_token": "eyJrefresh",
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": 1234567890,
    "user": _USER_PAYLOAD,
}


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def supabase_client() -> SupabaseAuthClient:
    http = httpx.AsyncClient()
    return SupabaseAuthClient(
        base_url=BASE_URL,
        secret_key=SECRET_KEY,
        http=http,
    )


# ---------------------------------------------------------------------------
# sign_in_with_password
# ---------------------------------------------------------------------------


@respx.mock
async def test_sign_in_happy_path(supabase_client: SupabaseAuthClient) -> None:
    respx.post(
        f"{BASE_URL}/token",
        params={"grant_type": "password"},
    ).mock(return_value=httpx.Response(200, json=_TOKEN_PAYLOAD))

    result = await supabase_client.sign_in_with_password("user@example.com", "pw")

    assert isinstance(result, TokenResponse)
    assert result.access_token == "eyJaccess"
    assert result.refresh_token == "eyJrefresh"
    assert result.expires_in == 3600
    assert str(result.user.id) == "00000000-0000-0000-0000-000000000001"
    assert result.user.email == "user@example.com"


@respx.mock
async def test_sign_in_invalid_credentials_maps_to_401(
    supabase_client: SupabaseAuthClient,
) -> None:
    respx.post(
        f"{BASE_URL}/token",
        params={"grant_type": "password"},
    ).mock(
        return_value=httpx.Response(
            400,
            json={
                "error_code": "invalid_grant",
                "error_description": "Invalid login credentials",
            },
        )
    )

    with pytest.raises(SupabaseAuthError) as exc_info:
        await supabase_client.sign_in_with_password("user@example.com", "wrong")

    err = exc_info.value
    assert err.status_code == 401
    assert err.message == "invalid_credentials"
    assert err.upstream_status == 400


@respx.mock
async def test_sign_in_rate_limited_maps_to_429(
    supabase_client: SupabaseAuthClient,
) -> None:
    respx.post(
        f"{BASE_URL}/token",
        params={"grant_type": "password"},
    ).mock(return_value=httpx.Response(429, json={"error": "too_many_requests"}))

    with pytest.raises(SupabaseAuthError) as exc_info:
        await supabase_client.sign_in_with_password("user@example.com", "pw")

    err = exc_info.value
    assert err.status_code == 429
    assert err.message == "rate_limited"
    assert err.upstream_status == 429


@respx.mock
async def test_sign_in_upstream_5xx_maps_to_503(
    supabase_client: SupabaseAuthClient,
) -> None:
    respx.post(
        f"{BASE_URL}/token",
        params={"grant_type": "password"},
    ).mock(return_value=httpx.Response(500, json={"error": "internal_server_error"}))

    with pytest.raises(SupabaseAuthError) as exc_info:
        await supabase_client.sign_in_with_password("user@example.com", "pw")

    err = exc_info.value
    assert err.status_code == 503
    assert err.message == "upstream_unavailable"
    assert err.upstream_status == 500


# ---------------------------------------------------------------------------
# refresh_session
# ---------------------------------------------------------------------------


@respx.mock
async def test_refresh_session_happy_path(supabase_client: SupabaseAuthClient) -> None:
    respx.post(
        f"{BASE_URL}/token",
        params={"grant_type": "refresh_token"},
    ).mock(return_value=httpx.Response(200, json=_TOKEN_PAYLOAD))

    result = await supabase_client.refresh_session("eyJrefresh")

    assert isinstance(result, TokenResponse)
    assert result.access_token == "eyJaccess"
    assert result.user.email == "user@example.com"


# ---------------------------------------------------------------------------
# get_user
# ---------------------------------------------------------------------------


@respx.mock
async def test_get_user_sends_apikey_and_bearer(
    supabase_client: SupabaseAuthClient,
) -> None:
    """Verify that both apikey and Authorization: Bearer headers are sent."""
    route = respx.get(f"{BASE_URL}/user").mock(
        return_value=httpx.Response(200, json=_USER_PAYLOAD)
    )

    result = await supabase_client.get_user("eyJaccess")

    assert isinstance(result, SupabaseUser)
    assert result.email == "user@example.com"

    # Inspect the outgoing request headers
    assert route.called
    sent_request = route.calls.last.request
    assert sent_request.headers["apikey"] == SECRET_KEY
    assert sent_request.headers["authorization"] == "Bearer eyJaccess"


# ---------------------------------------------------------------------------
# sign_out
# ---------------------------------------------------------------------------


@respx.mock
async def test_sign_out_best_effort_swallows_upstream_errors(
    supabase_client: SupabaseAuthClient,
) -> None:
    """A 500 from gotrue during sign-out must NOT raise — best-effort revoke."""
    respx.post(f"{BASE_URL}/logout").mock(
        return_value=httpx.Response(500, json={"error": "internal_server_error"})
    )

    # Must not raise
    result = await supabase_client.sign_out("eyJaccess")
    assert result is None


@respx.mock
async def test_sign_out_success_returns_none(
    supabase_client: SupabaseAuthClient,
) -> None:
    respx.post(f"{BASE_URL}/logout").mock(
        return_value=httpx.Response(204)
    )

    result = await supabase_client.sign_out("eyJaccess", scope="global")
    assert result is None


# ---------------------------------------------------------------------------
# recover_password
# ---------------------------------------------------------------------------


@respx.mock
async def test_recover_password_returns_none_on_200(
    supabase_client: SupabaseAuthClient,
) -> None:
    respx.post(f"{BASE_URL}/recover").mock(
        return_value=httpx.Response(200, json={})
    )

    result = await supabase_client.recover_password("user@example.com")
    assert result is None


# ---------------------------------------------------------------------------
# update_user_password
# ---------------------------------------------------------------------------


@respx.mock
async def test_update_user_password_sends_recovery_bearer(
    supabase_client: SupabaseAuthClient,
) -> None:
    """PUT /user must carry the recovery access token in Authorization."""
    route = respx.put(f"{BASE_URL}/user").mock(
        return_value=httpx.Response(200, json=_USER_PAYLOAD)
    )

    result = await supabase_client.update_user_password("eyJrecovery", "newpassword123")

    assert isinstance(result, SupabaseUser)
    assert result.email == "user@example.com"

    sent_request = route.calls.last.request
    assert sent_request.headers["apikey"] == SECRET_KEY
    assert sent_request.headers["authorization"] == "Bearer eyJrecovery"


# ---------------------------------------------------------------------------
# admin_create_user
# ---------------------------------------------------------------------------


@respx.mock
async def test_admin_create_user_happy_path(
    supabase_client: SupabaseAuthClient,
) -> None:
    respx.post(f"{BASE_URL}/admin/users").mock(
        return_value=httpx.Response(200, json=_USER_PAYLOAD)
    )

    result = await supabase_client.admin_create_user(
        "user@example.com",
        "secure_password",
        email_confirm=True,
        app_metadata={"role": "staff"},
    )

    assert isinstance(result, SupabaseUser)
    assert str(result.id) == "00000000-0000-0000-0000-000000000001"
    assert result.email == "user@example.com"


@respx.mock
async def test_admin_create_user_duplicate_maps_to_409(
    supabase_client: SupabaseAuthClient,
) -> None:
    """A 422 with error_code 'email_exists' must map to 409 email_exists."""
    respx.post(f"{BASE_URL}/admin/users").mock(
        return_value=httpx.Response(
            422,
            json={
                "error_code": "email_exists",
                "msg": "A user with this email address has already been registered",
            },
        )
    )

    with pytest.raises(SupabaseAuthError) as exc_info:
        await supabase_client.admin_create_user("user@example.com", "pw")

    err = exc_info.value
    assert err.status_code == 409
    assert err.message == "email_exists"
    assert err.upstream_status == 422


@respx.mock
async def test_admin_create_user_no_authorization_header(
    supabase_client: SupabaseAuthClient,
) -> None:
    """Admin endpoints must NOT send an Authorization header."""
    route = respx.post(f"{BASE_URL}/admin/users").mock(
        return_value=httpx.Response(200, json=_USER_PAYLOAD)
    )

    await supabase_client.admin_create_user("user@example.com", "pw")

    sent_request = route.calls.last.request
    assert sent_request.headers["apikey"] == SECRET_KEY
    assert "authorization" not in sent_request.headers


# ---------------------------------------------------------------------------
# admin_get_user_by_email
# ---------------------------------------------------------------------------


@respx.mock
async def test_admin_get_user_by_email_none_when_not_found(
    supabase_client: SupabaseAuthClient,
) -> None:
    """Empty list response from gotrue must return None."""
    respx.get(f"{BASE_URL}/admin/users").mock(
        return_value=httpx.Response(200, json={"users": []})
    )

    result = await supabase_client.admin_get_user_by_email("notfound@example.com")
    assert result is None


@respx.mock
async def test_admin_get_user_by_email_returns_first_match(
    supabase_client: SupabaseAuthClient,
) -> None:
    """Non-empty list must return the first user parsed as SupabaseUser."""
    respx.get(f"{BASE_URL}/admin/users").mock(
        return_value=httpx.Response(200, json={"users": [_USER_PAYLOAD]})
    )

    result = await supabase_client.admin_get_user_by_email("user@example.com")
    assert result is not None
    assert result.email == "user@example.com"
    assert str(result.id) == "00000000-0000-0000-0000-000000000001"

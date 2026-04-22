"""HTTP relay to the Supabase Auth (gotrue) service.

Filled in by T1.W2.3 with ``SupabaseAuthClient`` (httpx.AsyncClient
wrapper), ``TokenResponse``, ``SupabaseUser``, ``SupabaseAuthError``.

Key-format constraint (research T1.W1.0d): new ``sb_*`` keys only go
in the ``apikey`` header. The ``Authorization: Bearer ...`` header is
reserved for the user's access token.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

import httpx
import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)


class SupabaseUser(BaseModel):
    id: UUID
    email: str | None = None
    phone: str | None = None
    app_metadata: dict[str, Any] = Field(default_factory=dict)
    user_metadata: dict[str, Any] = Field(default_factory=dict)
    aud: str | None = None
    role: str | None = None
    created_at: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    expires_at: int | None = None
    user: SupabaseUser


class SupabaseAuthError(Exception):
    """Normalized error raised by SupabaseAuthClient.

    ``status_code`` maps gotrue HTTP codes to what the BFF should expose
    to its own callers. ``message`` is a short machine-friendly code
    (e.g. ``"invalid_credentials"``, ``"upstream_unavailable"``).
    """

    def __init__(
        self,
        *,
        status_code: int,
        message: str,
        upstream_status: int | None = None,
        upstream_body: Any = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.upstream_status = upstream_status
        self.upstream_body = upstream_body
        super().__init__(f"{status_code} {message}")


class SupabaseAuthClient:
    """Thin async relay over the Supabase Auth (gotrue) HTTP API.

    The caller provides a pre-built httpx.AsyncClient and the gotrue
    base URL (e.g. ``https://<ref>.supabase.co/auth/v1``) and the secret
    API key (``sb_secret_*`` or legacy service_role JWT). The client
    always sets the ``apikey`` header and adds ``Authorization`` only when
    the endpoint needs the user's access token.
    """

    def __init__(
        self,
        *,
        base_url: str,
        secret_key: str,
        http: httpx.AsyncClient,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._secret_key = secret_key
        self._http = http

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _headers(self, *, access_token: str | None = None) -> dict[str, str]:
        """Build request headers.

        The ``apikey`` header always carries the secret key.
        ``Authorization`` is only set when a user access token is provided
        (user-scoped endpoints). The secret key is NEVER placed in
        ``Authorization`` — required for new ``sb_*`` key format.
        """
        h: dict[str, str] = {
            "apikey": self._secret_key,
            "Content-Type": "application/json",
        }
        if access_token:
            h["Authorization"] = f"Bearer {access_token}"
        return h

    async def _raise_for_status(
        self, response: httpx.Response, *, action: str
    ) -> None:
        """Translate gotrue HTTP error responses into SupabaseAuthError."""
        if response.is_success:
            return

        try:
            body: Any = response.json()
        except ValueError:
            body = response.text

        upstream = response.status_code

        if upstream in (400, 401):
            code = 401
            msg = "invalid_credentials"
            if isinstance(body, dict):
                err_code = str(body.get("error_code") or body.get("error") or "")
                if "weak_password" in err_code:
                    code = 400
                    msg = "weak_password"
                elif "email_exists" in err_code or "already_registered" in err_code:
                    code = 409
                    msg = "email_exists"
        elif upstream == 422:
            # Check 422 body for specific business errors before defaulting
            code = 400
            msg = "validation_error"
            if isinstance(body, dict):
                err_code = str(body.get("error_code") or body.get("error") or "")
                if "email_exists" in err_code or "already_registered" in err_code:
                    code = 409
                    msg = "email_exists"
        elif upstream == 429:
            code, msg = 429, "rate_limited"
        elif 500 <= upstream < 600:
            code, msg = 503, "upstream_unavailable"
        else:
            code, msg = 502, "upstream_error"

        logger.warning(
            "supabase_auth.error",
            action=action,
            upstream_status=upstream,
            body=body,
        )
        raise SupabaseAuthError(
            status_code=code,
            message=msg,
            upstream_status=upstream,
            upstream_body=body,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def sign_in_with_password(
        self, email: str, password: str
    ) -> TokenResponse:
        """Authenticate with email + password; returns tokens + user."""
        url = f"{self._base_url}/token"
        response = await self._http.post(
            url,
            params={"grant_type": "password"},
            json={"email": email, "password": password},
            headers=self._headers(),
        )
        await self._raise_for_status(response, action="sign_in_with_password")
        return TokenResponse.model_validate(response.json())

    async def refresh_session(self, refresh_token: str) -> TokenResponse:
        """Exchange a refresh token for a new token pair."""
        url = f"{self._base_url}/token"
        response = await self._http.post(
            url,
            params={"grant_type": "refresh_token"},
            json={"refresh_token": refresh_token},
            headers=self._headers(),
        )
        await self._raise_for_status(response, action="refresh_session")
        return TokenResponse.model_validate(response.json())

    async def get_user(self, access_token: str) -> SupabaseUser:
        """Fetch the user record associated with the given access token."""
        url = f"{self._base_url}/user"
        response = await self._http.get(
            url,
            headers=self._headers(access_token=access_token),
        )
        await self._raise_for_status(response, action="get_user")
        return SupabaseUser.model_validate(response.json())

    async def sign_out(
        self,
        access_token: str,
        *,
        scope: Literal["local", "global", "others"] = "local",
    ) -> None:
        """Revoke the session on the gotrue side (best-effort).

        Upstream errors (401, 404, 5xx) are logged but NOT re-raised —
        the BFF must still clear its own cookies regardless of upstream state.
        """
        url = f"{self._base_url}/logout"
        try:
            response = await self._http.post(
                url,
                params={"scope": scope},
                headers=self._headers(access_token=access_token),
            )
            if not response.is_success:
                try:
                    body: Any = response.json()
                except ValueError:
                    body = response.text
                logger.warning(
                    "supabase_auth.sign_out.upstream_error",
                    upstream_status=response.status_code,
                    body=body,
                )
        except httpx.HTTPError as exc:
            logger.warning("supabase_auth.sign_out.http_error", error=str(exc))

    async def recover_password(self, email: str) -> None:
        """Send a password-recovery email via gotrue."""
        url = f"{self._base_url}/recover"
        response = await self._http.post(
            url,
            json={"email": email},
            headers=self._headers(),
        )
        await self._raise_for_status(response, action="recover_password")

    async def update_user_password(
        self, access_token: str, new_password: str
    ) -> SupabaseUser:
        """Update the password for the authenticated user.

        ``access_token`` is typically the short-lived recovery token
        obtained via the magic-link flow, not a regular session token.
        """
        url = f"{self._base_url}/user"
        response = await self._http.put(
            url,
            json={"password": new_password},
            headers=self._headers(access_token=access_token),
        )
        await self._raise_for_status(response, action="update_user_password")
        return SupabaseUser.model_validate(response.json())

    async def admin_create_user(
        self,
        email: str,
        password: str,
        *,
        email_confirm: bool = True,
        app_metadata: dict[str, Any] | None = None,
    ) -> SupabaseUser:
        """Create a user via the admin API (no user JWT required).

        Uses only the ``apikey`` header with the secret key — no
        ``Authorization`` header is sent.
        """
        url = f"{self._base_url}/admin/users"
        payload: dict[str, Any] = {
            "email": email,
            "password": password,
            "email_confirm": email_confirm,
        }
        if app_metadata is not None:
            payload["app_metadata"] = app_metadata

        response = await self._http.post(
            url,
            json=payload,
            headers=self._headers(),
        )
        await self._raise_for_status(response, action="admin_create_user")
        return SupabaseUser.model_validate(response.json())

    async def admin_update_user_password(
        self,
        user_id: UUID | str,
        new_password: str,
        *,
        app_metadata: dict[str, Any] | None = None,
    ) -> SupabaseUser:
        """Update a user's password (and optionally merge ``app_metadata``).

        PUT ``/admin/users/{id}`` with ``{"password": ..., "app_metadata": ...}``.
        Uses only the ``apikey`` header with the secret key — no
        ``Authorization`` header.

        The caller is responsible for passing the fully-merged
        ``app_metadata`` dict; Supabase merges (not replaces) this field
        on the admin PUT, but passing only the keys we want to flip is
        the safe pattern documented by gotrue.
        """
        url = f"{self._base_url}/admin/users/{user_id}"
        payload: dict[str, Any] = {"password": new_password}
        if app_metadata is not None:
            payload["app_metadata"] = app_metadata

        response = await self._http.put(
            url,
            json=payload,
            headers=self._headers(),
        )
        await self._raise_for_status(response, action="admin_update_user_password")
        return SupabaseUser.model_validate(response.json())

    async def admin_delete_user(self, user_id: UUID | str) -> None:
        """Delete a user via the admin API.

        Irreversible. Uses only the ``apikey`` header with the secret key.
        Cascade on ``auth.users.id`` removes dependent ``public.user_profiles``
        rows; ``public.collaborators.user_id`` is set to NULL by the FK.

        Upstream 404 is tolerated (already gone) — any other error is raised.
        """
        url = f"{self._base_url}/admin/users/{user_id}"
        response = await self._http.delete(url, headers=self._headers())
        if response.status_code == 404:
            logger.info("supabase_auth.admin_delete_user.not_found", user_id=str(user_id))
            return
        await self._raise_for_status(response, action="admin_delete_user")

    async def admin_get_user_by_email(self, email: str) -> SupabaseUser | None:
        """Fetch a user by email via the admin list endpoint.

        Returns ``None`` when no user matches (empty list or missing user).
        Uses only the ``apikey`` header — no ``Authorization`` header.
        """
        url = f"{self._base_url}/admin/users"
        response = await self._http.get(
            url,
            params={"email": email},
            headers=self._headers(),
        )
        await self._raise_for_status(response, action="admin_get_user_by_email")

        data = response.json()

        # gotrue returns either a list directly or {"users": [...]}
        if isinstance(data, list):
            users = data
        elif isinstance(data, dict):
            users = data.get("users", [])
        else:
            users = []

        if not users:
            return None

        return SupabaseUser.model_validate(users[0])

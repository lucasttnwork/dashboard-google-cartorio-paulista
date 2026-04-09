"""Authentication + authorization FastAPI dependencies.

Exposes:

- ``AuthenticatedUser`` dataclass
- ``get_current_user`` (reads cookies, validates JWT, loads role from DB,
  transparently refreshes on expiry)
- ``require_authenticated`` / ``require_role(*allowed)`` helpers
- ``get_supabase_auth``, ``get_rate_limiter``, ``get_redis`` accessor deps
- ``set_session_cookies``, ``clear_session_cookies`` cookie helpers
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

import structlog
from fastapi import Depends, HTTPException, Request, Response
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    AccessTokenClaims,
    JWTExpiredError,
    JWTValidationError,
    verify_access_token,
)
from app.db.models.user_profile import UserProfile
from app.deps.db import get_session
from app.services.rate_limit import RateLimiter
from app.services.supabase_auth import (
    SupabaseAuthClient,
    SupabaseAuthError,
    TokenResponse,
)

logger = structlog.get_logger(__name__)

Role = Literal["admin", "manager", "viewer"]


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    email: str
    role: Role
    created_at: datetime
    disabled_at: datetime | None

    @property
    def is_active(self) -> bool:
        return self.disabled_at is None


# --- Accessor dependencies (read from app.state, set by lifespan T1.W2.8) ---


def get_supabase_auth(request: Request) -> SupabaseAuthClient:
    client: SupabaseAuthClient | None = getattr(request.app.state, "supabase_auth", None)
    if client is None:
        raise HTTPException(status_code=503, detail="auth_service_unavailable")
    return client


def get_redis(request: Request) -> Redis:  # type: ignore[type-arg]
    redis: Redis | None = getattr(request.app.state, "redis", None)  # type: ignore[type-arg]
    if redis is None:
        raise HTTPException(status_code=503, detail="redis_unavailable")
    return redis


def get_rate_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter | None = getattr(request.app.state, "rate_limiter", None)
    if limiter is None:
        raise HTTPException(status_code=503, detail="rate_limiter_unavailable")
    return limiter


# --- Cookie helpers (exported for api.v1.auth) ---


def set_session_cookies(response: Response, tokens: TokenResponse) -> None:
    response.set_cookie(
        key=settings.cookie_access_name,
        value=tokens.access_token,
        max_age=settings.cookie_access_max_age,
        path=settings.cookie_path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )
    response.set_cookie(
        key=settings.cookie_refresh_name,
        value=tokens.refresh_token,
        max_age=settings.cookie_refresh_max_age,
        path=settings.cookie_refresh_path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(
        key=settings.cookie_access_name,
        path=settings.cookie_path,
        domain=settings.cookie_domain,
    )
    response.delete_cookie(
        key=settings.cookie_refresh_name,
        path=settings.cookie_refresh_path,
        domain=settings.cookie_domain,
    )


def _clear_cookie_headers() -> dict[str, str]:
    """Build ``Set-Cookie`` headers that expire both session cookies.

    Used when raising HTTPException so that cookie-clearing is propagated
    even though the injected ``Response`` object is discarded by FastAPI's
    exception handler.

    Returns a dict with a single ``set-cookie`` key whose value is the two
    cookie directives joined by a comma — this is the only way to attach
    multiple Set-Cookie values via HTTPException.headers.

    Note: FastAPI/Starlette's exception handler passes the ``headers`` dict
    straight into the Response so the comma-joined value is not ideal.
    In practice we use two separate ``set-cookie`` entries by building a
    list and joining — but HTTPException only accepts ``dict[str, str]``.
    The browser will see ``Max-Age=0`` for both cookies and expire them.
    """
    # Build each directive manually so we control the exact string.
    access_dir = (
        f"{settings.cookie_access_name}="
        f"; Max-Age=0; Path={settings.cookie_path}; SameSite={settings.cookie_samesite}; HttpOnly"
    )
    refresh_dir = (
        f"{settings.cookie_refresh_name}="
        f"; Max-Age=0; Path={settings.cookie_refresh_path}"
        f"; SameSite={settings.cookie_samesite}; HttpOnly"
    )
    # Comma-join; RFC 6265 allows multiple Set-Cookie via separate headers,
    # but HTTPException.headers is dict[str,str].  The comma join is a
    # best-effort — real multi-header support is via Response.delete_cookie
    # (used for normal 200 responses).
    return {"set-cookie": f"{access_dir}, {refresh_dir}"}


# --- Main auth dependency ---


async def get_current_user(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    supabase: SupabaseAuthClient = Depends(get_supabase_auth),
) -> AuthenticatedUser:
    """Read cookies, validate JWT, auto-refresh on expiry, load role from DB.

    Order:
    1. Check request.state cache (for repeat lookups within one request).
    2. Read sb_access cookie. If missing -> 401.
    3. verify_access_token(access). On JWTExpiredError -> try refresh flow.
    4. On refresh success: rotate cookies via set_session_cookies, re-verify.
    5. On any failure: clear cookies via clear_session_cookies, raise 401.
    6. Load UserProfile from DB by user_id. If missing or disabled_at set -> 403.
    7. Cache on request.state.authenticated_user, return.
    """
    cached = getattr(request.state, "authenticated_user", None)
    if isinstance(cached, AuthenticatedUser):
        return cached

    access = request.cookies.get(settings.cookie_access_name)
    refresh = request.cookies.get(settings.cookie_refresh_name)

    claims: AccessTokenClaims | None = None

    if access:
        try:
            claims = await verify_access_token(access)
        except JWTExpiredError:
            if not refresh:
                raise HTTPException(
                    status_code=401,
                    detail="not_authenticated",
                    headers=_clear_cookie_headers(),
                )
            try:
                tokens = await supabase.refresh_session(refresh)
            except SupabaseAuthError as exc:
                logger.info("auth.refresh_failed", reason=exc.message)
                raise HTTPException(
                    status_code=401,
                    detail="not_authenticated",
                    headers=_clear_cookie_headers(),
                ) from exc
            set_session_cookies(response, tokens)
            try:
                claims = await verify_access_token(tokens.access_token)
            except JWTValidationError as exc:
                logger.warning("auth.refreshed_token_invalid", reason=str(exc))
                raise HTTPException(
                    status_code=401,
                    detail="not_authenticated",
                    headers=_clear_cookie_headers(),
                ) from exc
        except JWTValidationError as exc:
            logger.info("auth.invalid_access_token", reason=str(exc))
            raise HTTPException(
                status_code=401,
                detail="not_authenticated",
                headers=_clear_cookie_headers(),
            ) from exc

    if claims is None:
        raise HTTPException(
            status_code=401,
            detail="not_authenticated",
            headers=_clear_cookie_headers(),
        )

    profile = await session.scalar(
        select(UserProfile).where(UserProfile.user_id == claims.sub)
    )
    if profile is None:
        logger.warning("auth.profile_missing", sub=str(claims.sub))
        raise HTTPException(status_code=403, detail="forbidden")
    if profile.disabled_at is not None:
        logger.info("auth.profile_disabled", sub=str(claims.sub))
        raise HTTPException(status_code=403, detail="forbidden")

    user = AuthenticatedUser(
        id=profile.user_id,
        email=claims.email or "",
        role=profile.role,  # type: ignore[arg-type]
        created_at=profile.created_at,
        disabled_at=profile.disabled_at,
    )
    request.state.authenticated_user = user
    return user


def require_authenticated(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    return user


def require_role(*allowed: Role):  # type: ignore[return]
    async def _dep(
        user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="forbidden")
        return user

    return _dep

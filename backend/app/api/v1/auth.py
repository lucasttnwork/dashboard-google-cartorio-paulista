"""/api/v1/auth/* endpoints.

Filled in by T1.W2.6 (fan-in task). Depends on services/supabase_auth
(T1.W2.3), services/rate_limit (T1.W2.4), deps/auth (T1.W2.5), and
schemas/auth (this module's request/response models).

Endpoints:
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET  /api/v1/auth/me
- POST /api/v1/auth/refresh
- POST /api/v1/auth/forgot
- POST /api/v1/auth/reset
- GET  /api/v1/_debug/admin-only  (env != production only, AC-1.10)

Router mount note for T1.W2.8:
  app.include_router(auth.router, prefix="/api/v1/auth")
  if settings.env != "production":
      app.include_router(auth.debug_router, prefix="/api/v1")
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models.user_profile import UserProfile
from app.deps.auth import (
    AuthenticatedUser,
    get_current_user,
    get_rate_limiter,
    get_supabase_auth,
    require_role,
    set_session_cookies,
)
from app.deps.db import get_session
from app.db.models.audit_log import AuditLog
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ResetRequest,
    UserOut,
)
from app.services.rate_limit import (
    RateLimiter,
    forgot_rate_key,
    login_rate_key,
)
from app.services.supabase_auth import (
    SupabaseAuthClient,
    SupabaseAuthError,
)

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["auth"])
debug_router = APIRouter(tags=["debug"])


def _build_clear_cookie_headers() -> dict[str, str]:
    """Return Set-Cookie headers that expire both session cookies.

    Used with HTTPException so cookie-clearing is propagated even when the
    injected Response object is discarded by FastAPI's exception handler.
    Same pattern as deps/auth._clear_cookie_headers (private there).
    """
    access_dir = (
        f"{settings.cookie_access_name}="
        f"; Max-Age=0; Path={settings.cookie_path}; SameSite={settings.cookie_samesite}; HttpOnly"
    )
    refresh_dir = (
        f"{settings.cookie_refresh_name}="
        f"; Max-Age=0; Path={settings.cookie_refresh_path}"
        f"; SameSite={settings.cookie_samesite}; HttpOnly"
    )
    return {"set-cookie": f"{access_dir}, {refresh_dir}"}


# ---------------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------------


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LoginResponse:
    """Authenticate with email + password; set session cookies on success."""
    client_ip = request.client.host if request.client else "unknown"
    key = login_rate_key(body.email, client_ip)

    # Check existing lockout before consuming a sliding-window slot.
    lockout = await limiter.lockout_status(key)
    if lockout.level > 0 and lockout.locked_until is not None:
        retry_after = max(
            1,
            int((lockout.locked_until - datetime.now(timezone.utc)).total_seconds()),
        )
        raise HTTPException(
            status_code=429,
            detail="too_many_attempts",
            headers={"Retry-After": str(retry_after)},
        )

    # Sliding-window check.
    result = await limiter.hit(
        key,
        max_attempts=settings.auth_rate_limit_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    if not result.allowed:
        raise HTTPException(
            status_code=429,
            detail="rate_limited",
            headers={"Retry-After": str(result.retry_after_seconds)},
        )

    # Call Supabase.
    try:
        tokens = await supabase.sign_in_with_password(body.email, body.password)
    except SupabaseAuthError as exc:
        if exc.status_code == 401:
            await limiter.record_failure(key, steps=settings.auth_lockout_steps_seconds)
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Success — clear any previous lockout state.
    set_session_cookies(response, tokens)
    await limiter.clear_lockout(key)

    # Load BFF role from user_profiles.
    profile = await session.scalar(
        select(UserProfile).where(UserProfile.user_id == tokens.user.id)
    )
    if profile is None or profile.disabled_at is not None:
        raise HTTPException(
            status_code=403,
            detail="forbidden",
            headers=_build_clear_cookie_headers(),
        )

    return LoginResponse(
        user=UserOut(
            id=profile.user_id,
            email=tokens.user.email or "",
            role=profile.role,
            created_at=profile.created_at,
        ),
        expires_at=tokens.expires_at,
    )


# ---------------------------------------------------------------------------
# POST /logout
# ---------------------------------------------------------------------------


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
) -> Response:
    """Revoke upstream session (best-effort) and clear session cookies."""
    access = request.cookies.get(settings.cookie_access_name)
    if access:
        await supabase.sign_out(access, scope="local")
    # Build a fresh response so delete_cookie calls attach as separate headers.
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    resp.delete_cookie(
        key=settings.cookie_access_name,
        path=settings.cookie_path,
        domain=settings.cookie_domain,
    )
    resp.delete_cookie(
        key=settings.cookie_refresh_name,
        path=settings.cookie_refresh_path,
        domain=settings.cookie_domain,
    )
    return resp


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------


@router.get("/me", response_model=MeResponse)
async def me(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> MeResponse:
    """Return the currently authenticated user's profile."""
    return MeResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        created_at=user.created_at,
        app_metadata={},
        must_change_password=user.must_change_password,
    )


# ---------------------------------------------------------------------------
# POST /change-password
# ---------------------------------------------------------------------------


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Change the authenticated user's password in-session.

    Flow:
    1. Re-verify current password via ``sign_in_with_password`` (tokens discarded).
    2. Call admin PUT ``/admin/users/{id}`` with new password + flip
       ``app_metadata.must_change_password`` off.
    3. Refresh session so the rotated cookies carry the updated JWT claims
       (namely the cleared ``must_change_password`` flag).
    4. Audit log (never logs the password).
    """
    # Step 1: verify current password (401 from upstream -> 400 invalid_current).
    try:
        await supabase.sign_in_with_password(user.email, body.current_password)
    except SupabaseAuthError as exc:
        if exc.status_code == 401:
            raise HTTPException(
                status_code=400, detail="invalid_current_password"
            ) from exc
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Step 2: admin-update password + clear the force-change flag atomically.
    try:
        await supabase.admin_update_user_password(
            user.id,
            body.new_password,
            app_metadata={"must_change_password": False},
        )
    except SupabaseAuthError as exc:
        if exc.status_code == 400 and exc.message == "weak_password":
            raise HTTPException(status_code=400, detail="weak_password") from exc
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Step 3: rotate session tokens so the new JWT reflects the cleared flag.
    # The refresh cookie is scoped to /api/v1/auth/refresh and not sent here,
    # so instead we sign in again with the new password to mint a fresh pair
    # of tokens whose JWT claims carry the updated ``app_metadata``.
    # Best-effort — if this fails (e.g. transient upstream error) the password
    # change is still persisted; the user will pick up new claims after their
    # next refresh or re-login.
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        tokens = await supabase.sign_in_with_password(user.email, body.new_password)
        set_session_cookies(resp, tokens)
    except SupabaseAuthError as exc:
        logger.warning(
            "auth.change_password.reauth_failed", reason=exc.message
        )

    # Step 4: audit (password never logged).
    session.add(
        AuditLog(
            entity_type="user",
            entity_id=0,
            action="update",
            actor_id=user.id,
            actor_email=user.email,
            diff={
                "target_user_id": str(user.id),
                "password_changed": True,
            },
            created_at=datetime.now(timezone.utc),
        )
    )
    await session.commit()

    logger.info("auth.change_password.success", user_id=str(user.id))
    return resp


# ---------------------------------------------------------------------------
# POST /refresh
# ---------------------------------------------------------------------------


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    request: Request,
    response: Response,
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LoginResponse:
    """Exchange the refresh cookie for a new token pair."""
    _clear_hdrs = _build_clear_cookie_headers()
    refresh_token = request.cookies.get(settings.cookie_refresh_name)
    if not refresh_token:
        raise HTTPException(
            status_code=401, detail="not_authenticated", headers=_clear_hdrs
        )

    try:
        tokens = await supabase.refresh_session(refresh_token)
    except SupabaseAuthError as exc:
        raise HTTPException(
            status_code=401, detail="not_authenticated", headers=_clear_hdrs
        ) from exc

    set_session_cookies(response, tokens)

    profile = await session.scalar(
        select(UserProfile).where(UserProfile.user_id == tokens.user.id)
    )
    if profile is None or profile.disabled_at is not None:
        raise HTTPException(
            status_code=403, detail="forbidden", headers=_clear_hdrs
        )

    return LoginResponse(
        user=UserOut(
            id=profile.user_id,
            email=tokens.user.email or "",
            role=profile.role,
            created_at=profile.created_at,
        ),
        expires_at=tokens.expires_at,
    )


# ---------------------------------------------------------------------------
# POST /forgot
# ---------------------------------------------------------------------------


@router.post("/forgot")
async def forgot(
    body: ForgotRequest,
    request: Request,
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> dict[str, object]:
    """Send a password-recovery email. Always returns 200 {} (anti-enumeration)."""
    client_ip = request.client.host if request.client else "unknown"
    key = forgot_rate_key(body.email, client_ip)

    result = await limiter.hit(
        key,
        max_attempts=settings.auth_forgot_rate_limit_attempts,
        window_seconds=settings.auth_forgot_rate_limit_window_seconds,
    )
    if not result.allowed:
        logger.info("auth.forgot.rate_limited", email=body.email)
        return {}

    try:
        await supabase.recover_password(body.email)
        logger.info("auth.forgot.sent", email=body.email)
    except SupabaseAuthError as exc:
        logger.info("auth.forgot.upstream_error", email=body.email, reason=exc.message)

    return {}


# ---------------------------------------------------------------------------
# POST /reset
# ---------------------------------------------------------------------------


@router.post("/reset")
async def reset(
    body: ResetRequest,
    supabase: Annotated[SupabaseAuthClient, Depends(get_supabase_auth)],
) -> dict[str, object]:
    """Update the user's password using the recovery access token."""
    try:
        await supabase.update_user_password(body.access_token, body.password)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {"ok": True}


# ---------------------------------------------------------------------------
# GET /_debug/admin-only  (non-production only)
# ---------------------------------------------------------------------------

if settings.env != "production":

    @debug_router.get("/_debug/admin-only")
    async def debug_admin_only(
        user: Annotated[AuthenticatedUser, Depends(require_role("admin"))],
    ) -> dict[str, object]:
        """Smoke-test endpoint that verifies the admin role gate (AC-1.10)."""
        return {"ok": True, "user_id": str(user.id), "role": user.role}

"""JWKS-backed JWT verification for Supabase-issued access tokens.

Filled in by T1.W2.2. Exposes `verify_access_token`, `warm_jwks_cache`,
and the `AccessTokenClaims` / `JWTValidationError` / `JWTExpiredError`
types that `app/deps/auth.py` depends on.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from uuid import UUID

import jwt
import structlog

from app.core.config import settings

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AccessTokenClaims:
    sub: UUID
    email: str | None
    aud: str
    iss: str
    exp: int
    iat: int
    app_metadata: dict[str, object]
    session_id: str | None


class JWTValidationError(Exception):
    """Base class for JWT validation failures."""


class JWTExpiredError(JWTValidationError):
    """Raised specifically when the token is expired, so callers can
    trigger the refresh flow instead of a hard 401."""


# ---------------------------------------------------------------------------
# Internal JWKS client — lazy singleton, replaceable by tests
# ---------------------------------------------------------------------------

_jwks_client: jwt.PyJWKClient | None = None
_jwks_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    """Return (or create) the module-level asyncio.Lock.

    Created lazily so that the module can be imported in non-async contexts
    without triggering the event-loop-required Lock() call.
    """
    global _jwks_lock  # noqa: PLW0603
    if _jwks_lock is None:
        _jwks_lock = asyncio.Lock()
    return _jwks_lock


def _get_jwks_client() -> jwt.PyJWKClient:
    """Return (or create) the module-level PyJWKClient singleton.

    Lazy instantiation means tests can monkey-patch this function before the
    first call and inject a fake client without touching module-level state
    directly.
    """
    global _jwks_client  # noqa: PLW0603
    if _jwks_client is None:
        jwks_url = settings.resolved_supabase_jwks_url
        if not jwks_url:
            raise JWTValidationError("jwks_not_configured")
        cache_keys = True  # PyJWKClient caches by default
        _jwks_client = jwt.PyJWKClient(
            jwks_url,
            cache_keys=cache_keys,
            cache_jwk_set=True,
            lifespan=settings.supabase_jwks_cache_ttl_seconds,
        )
    return _jwks_client


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def verify_access_token(token: str) -> AccessTokenClaims:
    """Verify a Supabase-issued access token using the project JWKS.

    Raises JWTExpiredError on expiry, JWTValidationError on any other
    failure (bad signature, wrong iss/aud, missing sub, missing config, etc).
    """
    jwks_url = settings.resolved_supabase_jwks_url
    if not jwks_url:
        raise JWTValidationError("jwks_not_configured")

    issuer = settings.resolved_supabase_jwt_issuer
    audience = settings.supabase_jwt_audience
    leeway = settings.supabase_jwt_leeway_seconds

    # Build the algorithm allow-list.  HS256 is only added when a shared
    # secret is configured, acting as a legacy fallback.
    algorithms: list[str] = list(settings.supabase_jwt_algorithms)
    hs_secret: str | None = settings.supabase_jwt_hs_secret or None
    if hs_secret and "HS256" not in algorithms:
        algorithms.append("HS256")

    # Acquire lock to avoid parallel threads spawning multiple blocking calls
    # simultaneously (PyJWKClient.get_signing_key_from_jwt is urllib-based).
    lock = _get_lock()
    async with lock:
        try:
            client = _get_jwks_client()

            # HS256 path: shared-secret verification, no JWKS needed.
            header = jwt.get_unverified_header(token)
            alg = header.get("alg", "")

            if alg == "HS256" and hs_secret:
                signing_key: str | jwt.algorithms.RSAAlgorithm | object = hs_secret  # type: ignore[assignment]
            else:
                signing_key_obj = await asyncio.to_thread(
                    client.get_signing_key_from_jwt, token
                )
                signing_key = signing_key_obj.key

            payload: dict[str, object] = await asyncio.to_thread(
                jwt.decode,
                token,
                signing_key,
                algorithms=algorithms,
                audience=audience,
                issuer=issuer,
                leeway=leeway,
            )

        except jwt.ExpiredSignatureError as exc:
            raise JWTExpiredError("access_token_expired") from exc
        except jwt.InvalidTokenError as exc:
            raise JWTValidationError(f"invalid_token: {exc}") from exc
        except JWTValidationError:
            raise
        except Exception as exc:
            raise JWTValidationError(f"jwt_verification_failed: {exc}") from exc

    # --- Extract claims ---
    raw_sub = payload.get("sub")
    if not raw_sub:
        raise JWTValidationError("missing_sub_claim")
    try:
        sub = UUID(str(raw_sub))
    except (ValueError, AttributeError) as exc:
        raise JWTValidationError(f"invalid_sub_uuid: {raw_sub}") from exc

    raw_aud = payload.get("aud", "")
    # pyjwt returns aud as a string or list; normalise to str for our claim.
    if isinstance(raw_aud, list):
        aud_str = raw_aud[0] if raw_aud else ""
    else:
        aud_str = str(raw_aud)

    return AccessTokenClaims(
        sub=sub,
        email=payload.get("email") if isinstance(payload.get("email"), str) else None,  # type: ignore[arg-type]
        aud=aud_str,
        iss=str(payload.get("iss", "")),
        exp=int(payload["exp"]),  # type: ignore[arg-type]
        iat=int(payload["iat"]),  # type: ignore[arg-type]
        app_metadata=dict(payload.get("app_metadata") or {}),  # type: ignore[arg-type]
        session_id=payload.get("session_id") if isinstance(payload.get("session_id"), str) else None,  # type: ignore[arg-type]
    )


async def warm_jwks_cache() -> None:
    """Prefetch the JWKS so the first real request doesn't pay the fetch
    latency.  Called from the FastAPI lifespan startup hook.

    Any error is logged and swallowed — startup must not fail just because
    the JWKS endpoint is temporarily unreachable.
    """
    try:
        client = _get_jwks_client()
        await asyncio.to_thread(client.get_signing_keys)
        logger.info("jwks_cache_warmed")
    except Exception as exc:  # noqa: BLE001
        logger.warning("jwks_cache_warm_failed", error=str(exc))

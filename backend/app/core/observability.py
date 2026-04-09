"""Sentry initialization and the request-id middleware.

Wired into ``app/main.py``:

- ``init_sentry(dsn, env, release)`` is called at import time before the
  FastAPI app is built. No-op when ``dsn`` is empty so local development
  without a DSN does not crash.
- ``RequestIdMiddleware`` reads an incoming ``X-Request-ID`` header (or
  generates a UUID4 if absent), binds it to the structlog contextvars for
  the lifetime of the request, and echoes it on the response.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


def init_sentry(*, dsn: str, env: str, release: str) -> bool:
    """Initialize the Sentry SDK for FastAPI.

    Returns True when sentry was initialized, False when skipped (no DSN).
    Never raises — Sentry availability is opt-in and must not break the
    application boot.
    """
    if not dsn:
        logger.info("sentry.skipped", reason="no_dsn", env=env)
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=env,
            release=release,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
            traces_sample_rate=0.1,
            send_default_pii=False,
            attach_stacktrace=True,
        )
        logger.info("sentry.initialized", env=env, release=release)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("sentry.init_failed", error=str(exc))
        return False


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Bind a request-scoped correlation ID to structlog contextvars.

    Honors an inbound ``X-Request-ID`` header when present, otherwise
    generates a fresh UUID4. Always echoes the chosen value back in the
    response header so the caller (and upstream proxies) can correlate.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex

        # Bind to structlog contextvars for the lifetime of this request.
        # clear_contextvars() on the way out is handled by structlog's
        # contextvars merge processor — scoping is per-task, not global.
        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")

        response.headers[REQUEST_ID_HEADER] = request_id
        return response

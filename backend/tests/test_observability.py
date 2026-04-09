"""Tests for app/core/observability.py (T1.W2.8)."""

from __future__ import annotations

import uuid

import httpx
import pytest
import structlog
from fastapi import FastAPI
from httpx import ASGITransport

from app.core.observability import (
    REQUEST_ID_HEADER,
    RequestIdMiddleware,
    init_sentry,
)


def test_init_sentry_no_dsn_is_noop() -> None:
    """Empty DSN must not raise and must return False."""
    assert init_sentry(dsn="", env="local", release="0.0.1") is False


def test_init_sentry_invalid_dsn_does_not_raise() -> None:
    """A malformed DSN should be swallowed — Sentry is opt-in and must
    never break boot."""
    # sentry_sdk.init with a bad DSN raises ``BadDsn`` internally;
    # init_sentry catches any Exception.
    result = init_sentry(dsn="not-a-real-dsn", env="local", release="0.0.1")
    assert result is False


@pytest.mark.asyncio
async def test_request_id_middleware_echoes_inbound_header() -> None:
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/probe")
    async def probe() -> dict[str, str]:
        # Bound contextvar should be visible here.
        ctx = structlog.contextvars.get_contextvars()
        return {"bound_request_id": ctx.get("request_id", "")}

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/probe", headers={REQUEST_ID_HEADER: "abc-123"})

    assert resp.status_code == 200
    assert resp.headers[REQUEST_ID_HEADER] == "abc-123"
    assert resp.json()["bound_request_id"] == "abc-123"


@pytest.mark.asyncio
async def test_request_id_middleware_generates_uuid_when_absent() -> None:
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/probe")
    async def probe() -> dict[str, str]:
        return {"ok": "1"}

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/probe")

    assert resp.status_code == 200
    rid = resp.headers[REQUEST_ID_HEADER]
    # Generated UUID4 .hex form: 32 hexadecimal characters.
    assert len(rid) == 32
    uuid.UUID(rid)  # must parse — raises if not a valid UUID


@pytest.mark.asyncio
async def test_request_id_unbound_after_request() -> None:
    """Each request should leave structlog contextvars clean for the next."""
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/probe")
    async def probe() -> dict[str, str]:
        return {"ok": "1"}

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/probe", headers={REQUEST_ID_HEADER: "first"})
        # After the first request returns, the contextvar should be unbound
        # in this test scope.
        ctx = structlog.contextvars.get_contextvars()
        assert "request_id" not in ctx

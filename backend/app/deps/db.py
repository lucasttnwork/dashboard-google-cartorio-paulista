"""Async SQLAlchemy session dependency.

Exposes `get_session()` yielding an `AsyncSession` bound to the
`async_sessionmaker` stored on `app.state.db_sessionmaker`.

The sessionmaker is created at lifespan startup (T1.W2.8) when
settings.database_url is non-empty. If the engine is None at startup,
the lifespan leaves `app.state.db_sessionmaker` unset and endpoints
that call get_session() receive a 503.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield an AsyncSession bound to the engine stored on app.state.

    The engine is created at lifespan startup (T1.W2.8) when
    settings.database_url is non-empty. If the sessionmaker is missing at
    request time, raise 503 — this is expected in tests that opt out
    of a real DB via dependency overrides.
    """
    sessionmaker: async_sessionmaker[AsyncSession] | None = getattr(
        request.app.state, "db_sessionmaker", None
    )
    if sessionmaker is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with sessionmaker() as session:
        yield session

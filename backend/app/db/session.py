from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from ..core.config import settings


def get_engine() -> AsyncEngine | None:
    """Build the SQLAlchemy async engine lazily.

    Returns `None` when `DATABASE_URL` is unset so that local scaffolding and
    tests do not attempt to open a connection. Real DB wiring lands in a later
    phase.
    """

    if not settings.database_url:
        return None

    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        future=True,
    )

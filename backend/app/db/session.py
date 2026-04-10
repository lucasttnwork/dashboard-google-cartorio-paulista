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

    # statement_cache_size=0 is required when connecting through PgBouncer
    # (Supabase pooler) — asyncpg prepared statements conflict with pooled
    # connections.
    connect_args: dict = {}
    if "pooler.supabase.com" in settings.database_url:
        connect_args["statement_cache_size"] = 0

    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        future=True,
        connect_args=connect_args,
    )

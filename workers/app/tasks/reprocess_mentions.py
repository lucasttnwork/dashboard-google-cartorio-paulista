"""arq task: reprocess collaborator mentions.

Calls the existing Postgres function reprocess_reviews_for_collaborator()
via service_role connection. Enqueued by the backend when aliases change
or after a merge operation.
"""

from __future__ import annotations

import asyncpg
import structlog

from app.settings import settings

logger = structlog.get_logger(__name__)


async def reprocess_collaborator_mentions(
    ctx: dict, collaborator_id: int
) -> dict[str, object]:
    """Invoke reprocess_reviews_for_collaborator(id) in Postgres."""
    if not settings.database_url:
        logger.warning("reprocess.skipped", reason="no_database_url")
        return {"status": "skipped", "reason": "no_database_url"}

    # Convert SQLAlchemy-style URL to asyncpg format
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(dsn)
    try:
        result = await conn.fetchval(
            "SELECT reprocess_reviews_for_collaborator($1)", collaborator_id
        )
        logger.info(
            "reprocess.completed",
            collaborator_id=collaborator_id,
            result=result,
        )
        return {"status": "ok", "collaborator_id": collaborator_id, "result": result}
    except Exception as exc:
        logger.error(
            "reprocess.failed",
            collaborator_id=collaborator_id,
            error=str(exc),
        )
        raise
    finally:
        await conn.close()

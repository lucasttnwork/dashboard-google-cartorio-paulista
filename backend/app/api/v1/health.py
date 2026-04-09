from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Versioned health endpoint exposed at /api/v1/health (no trailing slash)."""
    return {"status": "ok", "service": "backend", "version": "0.0.1"}

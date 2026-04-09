from __future__ import annotations

from typing import Any


async def example_task(ctx: dict[str, Any]) -> dict[str, str]:
    """Placeholder task used to validate the arq scaffold.

    Phase 4 replaces this with real review-sync and scraper tasks.
    """

    return {"status": "ok", "task": "example"}

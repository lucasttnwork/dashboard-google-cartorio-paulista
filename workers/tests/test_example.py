from __future__ import annotations

import pytest

from app.tasks.example import example_task


@pytest.mark.asyncio
async def test_example_task_returns_ok() -> None:
    """The example task should return a stable shape for the scaffold.

    Phase 4 will replace this with real integration tests backed by
    ``fakeredis`` and a spun-up arq worker.
    """

    result = await example_task({})
    assert result == {"status": "ok", "task": "example"}

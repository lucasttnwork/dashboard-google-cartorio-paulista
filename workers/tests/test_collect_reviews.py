"""Tests for workers/app/tasks/collect_reviews.py"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.collect_reviews import collect_reviews, _check_degraded


@pytest.fixture
def ctx():
    """Base context dict for tests."""
    return {
        "db_pool": None,
        "redis": None,
        "apify_client": None,
    }


@pytest.mark.asyncio
async def test_collect_disabled(ctx):
    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = False
        result = await collect_reviews(ctx)
    assert result["status"] == "disabled"


@pytest.mark.asyncio
async def test_collect_no_apify_client(ctx):
    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = True
        result = await collect_reviews(ctx)
    assert result["status"] == "error"
    assert result["reason"] == "no_apify_client"


@pytest.mark.asyncio
async def test_collect_degraded_mode(ctx):
    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(return_value=b"1")
    ctx["redis"] = redis_mock

    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = True
        ctx["apify_client"] = MagicMock()
        result = await collect_reviews(ctx)
    assert result["status"] == "degraded"


@pytest.mark.asyncio
async def test_check_degraded_redis_key():
    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(return_value=b"1")
    result = await _check_degraded(None, redis_mock)
    assert result is True


@pytest.mark.asyncio
async def test_check_degraded_no_redis_no_pool():
    result = await _check_degraded(None, None)
    assert result is False


@pytest.mark.asyncio
async def test_collect_actor_timeout(ctx):
    """Actor returns TIMED-OUT status."""
    apify_mock = AsyncMock()
    actor_mock = AsyncMock()
    actor_mock.call = AsyncMock(return_value={
        "status": "TIMED-OUT",
        "defaultDatasetId": None,
    })
    apify_mock.actor = MagicMock(return_value=actor_mock)
    ctx["apify_client"] = apify_mock

    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = True
        mock_settings.google_place_url = "https://maps.google.com/place/test"
        mock_settings.collection_window_hours = 3
        mock_settings.location_id = "test-loc"
        result = await collect_reviews(ctx)
    assert result["status"] == "timeout"


@pytest.mark.asyncio
async def test_collect_happy_path_with_dedup(ctx):
    """Happy path: 2 items, 1 new + 1 dedup."""
    # Mock apify client
    dataset_mock = AsyncMock()
    list_page_mock = MagicMock()
    list_page_mock.items = [
        {"reviewId": "new1", "stars": 5, "text": "Great"},
        {"reviewId": "dup1", "stars": 4, "text": "OK"},
    ]
    dataset_mock.list_items = AsyncMock(return_value=list_page_mock)

    actor_mock = AsyncMock()
    actor_mock.call = AsyncMock(return_value={
        "status": "SUCCEEDED",
        "defaultDatasetId": "ds_123",
    })

    apify_mock = AsyncMock()
    apify_mock.actor = MagicMock(return_value=actor_mock)
    apify_mock.dataset = MagicMock(return_value=dataset_mock)
    ctx["apify_client"] = apify_mock

    # Mock DB pool
    conn_mock = AsyncMock()
    # 2 upsert fetchrows + 1 _record_run fetchrow
    conn_mock.fetchrow = AsyncMock(side_effect=[
        {"is_new": True},
        {"is_new": False},
        {"id": 1},
    ])
    conn_mock.fetch = AsyncMock(return_value=[])  # for _check_degraded

    pool_mock = AsyncMock()
    pool_mock.acquire = MagicMock(return_value=_async_ctx(conn_mock))
    ctx["db_pool"] = pool_mock

    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = True
        mock_settings.google_place_url = "https://maps.google.com/place/test"
        mock_settings.collection_window_hours = 3
        mock_settings.location_id = "test-loc"

        result = await collect_reviews(ctx)

    assert result["status"] == "completed"
    assert result["new"] == 1
    assert result["skipped"] == 1


class _async_ctx:
    """Helper to mock async context manager for pool.acquire()."""

    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass

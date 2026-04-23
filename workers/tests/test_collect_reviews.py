"""Tests for workers/app/tasks/collect_reviews.py"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.collect_reviews import collect_reviews, _check_degraded, _compute_window_hours


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
    # window_computation + 2 upsert fetchrows + 1 _record_run fetchrow
    conn_mock.fetchrow = AsyncMock(side_effect=[
        None,  # _compute_window_hours: no prior run → default
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


# --- Window computation tests (gap-coverage guarantee) ---

from datetime import datetime, timedelta, timezone


class _PoolCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *a):
        pass


def _pool_with_last_run(hours_ago):
    conn = AsyncMock()
    completed_at = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    conn.fetchrow = AsyncMock(return_value={"completed_at": completed_at})
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_PoolCtx(conn))
    return pool


@pytest.mark.asyncio
async def test_window_no_pool_returns_default():
    assert await _compute_window_hours(None, 3) == 3


@pytest.mark.asyncio
async def test_window_no_prior_run_returns_default():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_PoolCtx(conn))
    assert await _compute_window_hours(pool, 3) == 3


@pytest.mark.asyncio
async def test_window_weekday_2h_cadence():
    # Last run 2h ago → window = 3h (2 + 1 overlap)
    pool = _pool_with_last_run(2)
    assert await _compute_window_hours(pool, 3) == 3


@pytest.mark.asyncio
async def test_window_saturday_first_run_of_weekend():
    # Friday 22h → Saturday 8h = 10h gap → window = 11h covers fully
    pool = _pool_with_last_run(10)
    assert await _compute_window_hours(pool, 3) == 11


@pytest.mark.asyncio
async def test_window_sunday_after_saturday():
    # Sat 8h → Sun 8h = 24h gap → window = 25h
    pool = _pool_with_last_run(24)
    assert await _compute_window_hours(pool, 3) == 25


@pytest.mark.asyncio
async def test_window_monday_after_sunday():
    # Sun 8h → Mon 0h = 16h gap → window = 17h
    pool = _pool_with_last_run(16)
    assert await _compute_window_hours(pool, 3) == 17


@pytest.mark.asyncio
async def test_window_capped_at_7_days():
    # Collection broken for 30 days — cap at 168h
    pool = _pool_with_last_run(24 * 30)
    assert await _compute_window_hours(pool, 3) == 168


@pytest.mark.asyncio
async def test_window_never_below_default():
    # Last run 0.5h ago — still use default 3h floor
    pool = _pool_with_last_run(0)
    assert await _compute_window_hours(pool, 3) == 3


# --- Backfill mode tests ---


@pytest.mark.asyncio
async def test_backfill_returns_batch_id_and_skips_degraded(ctx):
    """window_hours_override bypasses degraded check + emits batch_id."""
    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(return_value=b"1")  # degraded — should be ignored
    ctx["redis"] = redis_mock

    actor_mock = AsyncMock()
    actor_mock.call = AsyncMock(return_value={
        "status": "SUCCEEDED",
        "defaultDatasetId": "ds_backfill",
    })
    dataset_mock = AsyncMock()
    list_page_mock = MagicMock()
    list_page_mock.items = []
    dataset_mock.list_items = AsyncMock(return_value=list_page_mock)
    apify_mock = AsyncMock()
    apify_mock.actor = MagicMock(return_value=actor_mock)
    apify_mock.dataset = MagicMock(return_value=dataset_mock)
    ctx["apify_client"] = apify_mock

    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = True
        mock_settings.google_place_url = "https://maps.google.com/place/test"
        mock_settings.collection_window_hours = 3
        mock_settings.location_id = "test-loc"

        result = await collect_reviews(
            ctx, window_hours_override=720, source_label="backfill"
        )

    assert result["status"] == "completed"
    assert "batch_id" in result
    actor_call_kwargs = actor_mock.call.await_args.kwargs
    # 720h → 30 days, must be sent as "days" unit
    assert actor_call_kwargs["run_input"]["reviewsStartDate"] == "30 days"


@pytest.mark.asyncio
async def test_collect_writes_batch_id_into_upsert(ctx):
    """Confirm collection_batch_id flows into the INSERT bind args."""
    list_page_mock = MagicMock()
    list_page_mock.items = [{"reviewId": "r1", "stars": 5, "text": "x"}]
    dataset_mock = AsyncMock()
    dataset_mock.list_items = AsyncMock(return_value=list_page_mock)
    actor_mock = AsyncMock()
    actor_mock.call = AsyncMock(return_value={
        "status": "SUCCEEDED",
        "defaultDatasetId": "ds_x",
    })
    apify_mock = AsyncMock()
    apify_mock.actor = MagicMock(return_value=actor_mock)
    apify_mock.dataset = MagicMock(return_value=dataset_mock)
    ctx["apify_client"] = apify_mock

    conn_mock = AsyncMock()
    conn_mock.fetchrow = AsyncMock(side_effect=[
        None,                # _compute_window_hours
        {"is_new": True},    # upsert
        {"id": 1},           # _record_run
    ])
    conn_mock.fetch = AsyncMock(return_value=[])  # _check_degraded
    pool_mock = AsyncMock()
    pool_mock.acquire = MagicMock(return_value=_async_ctx(conn_mock))
    ctx["db_pool"] = pool_mock

    with patch("app.tasks.collect_reviews.settings") as mock_settings:
        mock_settings.collection_enabled = True
        mock_settings.google_place_url = "https://maps.google.com/place/test"
        mock_settings.collection_window_hours = 3
        mock_settings.location_id = "test-loc"

        result = await collect_reviews(ctx)

    assert result["new"] == 1
    bind_args = [
        call.args for call in conn_mock.fetchrow.await_args_list
        if call.args and "INSERT INTO reviews" in str(call.args[0])
    ]
    assert bind_args, "no INSERT call captured"
    last_two = bind_args[0][-2:]  # collection_source_label, batch_id
    assert last_two[0] == "auto"
    assert isinstance(last_two[1], str) and len(last_two[1]) == 36
    assert last_two[1] == result["batch_id"]

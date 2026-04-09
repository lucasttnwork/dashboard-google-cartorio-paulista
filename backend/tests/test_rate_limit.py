"""Unit tests for Redis-backed sliding-window rate limiter (T1.W2.4).

Uses fakeredis.aioredis for hermetic, in-process testing — no real Redis required.
pytest-asyncio auto mode is configured in pyproject.toml (asyncio_mode = "auto").
"""

from __future__ import annotations

import time

import fakeredis.aioredis
import pytest

from app.services.rate_limit import (
    LockoutState,
    RateLimiter,
    RateLimitResult,
    forgot_rate_key,
    login_rate_key,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def redis():
    r = fakeredis.aioredis.FakeRedis(decode_responses=False)
    yield r
    await r.flushall()
    await r.aclose()


@pytest.fixture
def limiter(redis) -> RateLimiter:
    return RateLimiter(redis)


# ---------------------------------------------------------------------------
# Sliding window — happy paths
# ---------------------------------------------------------------------------


async def test_first_hit_allowed(limiter: RateLimiter) -> None:
    """First attempt must be allowed with remaining=4 (max_attempts=5)."""
    result = await limiter.hit("test:key:1", max_attempts=5, window_seconds=900)
    assert result.allowed is True
    assert result.current_count == 1
    assert result.remaining == 4
    assert result.retry_after_seconds == 0


async def test_five_hits_allowed_sixth_blocked(limiter: RateLimiter) -> None:
    """Five attempts all allowed; sixth is blocked with retry_after > 0."""
    key = "test:key:2"
    for i in range(5):
        result = await limiter.hit(key, max_attempts=5, window_seconds=900)
        assert result.allowed is True, f"Hit {i + 1} should be allowed"

    sixth = await limiter.hit(key, max_attempts=5, window_seconds=900)
    assert sixth.allowed is False
    assert sixth.remaining == 0
    assert sixth.retry_after_seconds >= 1
    assert sixth.current_count == 6


async def test_reset_clears_window(limiter: RateLimiter) -> None:
    """After reset(), the next hit is allowed (counter starts from zero)."""
    key = "test:key:3"
    for _ in range(5):
        await limiter.hit(key, max_attempts=5, window_seconds=900)
    blocked = await limiter.hit(key, max_attempts=5, window_seconds=900)
    assert blocked.allowed is False

    await limiter.reset(key)

    result = await limiter.hit(key, max_attempts=5, window_seconds=900)
    assert result.allowed is True
    assert result.current_count == 1


async def test_different_keys_are_independent(limiter: RateLimiter) -> None:
    """Exhausting one key does not affect another key."""
    key_a = "test:key:user_a@example.com:1.2.3.4"
    key_b = "test:key:user_b@example.com:1.2.3.4"

    # Fill key_a to the limit
    for _ in range(5):
        await limiter.hit(key_a, max_attempts=5, window_seconds=900)
    blocked = await limiter.hit(key_a, max_attempts=5, window_seconds=900)
    assert blocked.allowed is False

    # key_b is completely independent
    result_b = await limiter.hit(key_b, max_attempts=5, window_seconds=900)
    assert result_b.allowed is True
    assert result_b.current_count == 1


# ---------------------------------------------------------------------------
# Sliding window — time expiry
# ---------------------------------------------------------------------------


async def test_window_expires(limiter: RateLimiter, monkeypatch: pytest.MonkeyPatch) -> None:
    """Entries older than the window are pruned; request succeeds after window passes."""
    fake_now = time.time()
    monkeypatch.setattr("app.services.rate_limit.time.time", lambda: fake_now)

    key = "test:key:expire"
    window_seconds = 60

    # Exhaust the window
    for _ in range(5):
        await limiter.hit(key, max_attempts=5, window_seconds=window_seconds)
    blocked = await limiter.hit(key, max_attempts=5, window_seconds=window_seconds)
    assert blocked.allowed is False

    # Advance time past the window
    fake_now += window_seconds + 1
    monkeypatch.setattr("app.services.rate_limit.time.time", lambda: fake_now)

    # Old entries are pruned on the next hit; should be allowed
    result = await limiter.hit(key, max_attempts=5, window_seconds=window_seconds)
    assert result.allowed is True
    assert result.current_count == 1


# ---------------------------------------------------------------------------
# Lockout — record_failure
# ---------------------------------------------------------------------------


async def test_record_failure_level_one(
    limiter: RateLimiter, redis: fakeredis.aioredis.FakeRedis
) -> None:
    """First failure sets level=1, TTL=steps[0], locked_until in the future."""
    key = "test:lockout:1"
    steps = [900, 3600, 86400]
    state = await limiter.record_failure(key, steps=steps)

    assert state.level == 1
    assert state.locked_until is not None

    # Verify TTL stored in Redis matches steps[0]
    lockout_key = f"{key}:lockout"
    ttl = await redis.ttl(lockout_key)
    assert ttl > 0
    assert ttl <= steps[0]


async def test_record_failure_escalates(limiter: RateLimiter) -> None:
    """Three consecutive failures escalate to level=3."""
    key = "test:lockout:2"
    steps = [900, 3600, 86400]
    state = None
    for _ in range(3):
        state = await limiter.record_failure(key, steps=steps)
    assert state is not None
    assert state.level == 3


async def test_record_failure_capped_at_last_step(
    limiter: RateLimiter, redis: fakeredis.aioredis.FakeRedis
) -> None:
    """Level may exceed len(steps) but TTL is capped to steps[-1]."""
    key = "test:lockout:3"
    steps = [900, 3600, 86400]

    for _ in range(5):
        await limiter.record_failure(key, steps=steps)

    lockout_key = f"{key}:lockout"
    level_raw = await redis.get(lockout_key)
    level = int(level_raw.decode() if isinstance(level_raw, bytes) else level_raw)
    assert level == 5

    ttl = await redis.ttl(lockout_key)
    # TTL must be at most steps[-1]; it may be slightly less due to elapsed time
    assert ttl <= steps[-1]
    assert ttl > steps[-1] - 5  # within 5-second tolerance


# ---------------------------------------------------------------------------
# Lockout — clear_lockout and lockout_status
# ---------------------------------------------------------------------------


async def test_clear_lockout_drops_counter_and_window(limiter: RateLimiter) -> None:
    """After clear_lockout(), lockout_status returns level 0 and hit is allowed."""
    key = "test:lockout:4"
    steps = [900, 3600, 86400]

    # Record a failure and exhaust the sliding window
    await limiter.record_failure(key, steps=steps)
    for _ in range(5):
        await limiter.hit(key, max_attempts=5, window_seconds=900)

    await limiter.clear_lockout(key)

    status = await limiter.lockout_status(key)
    assert status.level == 0
    assert status.locked_until is None

    result = await limiter.hit(key, max_attempts=5, window_seconds=900)
    assert result.allowed is True
    assert result.current_count == 1


async def test_lockout_status_when_no_counter_set(limiter: RateLimiter) -> None:
    """With no prior failure, lockout_status returns level=0, locked_until=None."""
    key = "test:lockout:fresh"
    status = await limiter.lockout_status(key)
    assert status == LockoutState(level=0, locked_until=None)


# ---------------------------------------------------------------------------
# Key builders
# ---------------------------------------------------------------------------


def test_login_rate_key_lowercases_and_composes() -> None:
    """login_rate_key normalises e-mail to lowercase and composes correctly."""
    result = login_rate_key("USER@Foo.com", "1.2.3.4")
    assert result == "auth:rate:login:user@foo.com:1.2.3.4"


def test_forgot_rate_key_lowercases_and_composes() -> None:
    """forgot_rate_key normalises e-mail to lowercase and composes correctly."""
    result = forgot_rate_key("ADMIN@BAR.COM", "10.0.0.1")
    assert result == "auth:rate:forgot:admin@bar.com:10.0.0.1"

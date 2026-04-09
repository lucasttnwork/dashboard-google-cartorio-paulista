"""Redis-backed rate limiter with sliding window + escalating lockout.

Filled in by T1.W2.4 with ``RateLimiter``, ``RateLimitResult``,
``LockoutState``. Implementation uses Redis sorted sets
(``ZADD`` / ``ZREMRANGEBYSCORE`` / ``ZCARD``) keyed by
``auth:rate:<scope>:<email_lower>:<ip>`` with a companion lockout
counter at ``<key>:lockout``.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_seconds: int
    current_count: int


@dataclass(frozen=True)
class LockoutState:
    level: int  # 0 = not locked, 1-N = escalating
    locked_until: datetime | None


class RateLimiter:
    """Redis-backed sliding window rate limiter with escalating lockout.

    Sliding window implemented via a sorted set keyed by the caller's
    composite key; scores are millisecond timestamps. Each call to
    ``hit()`` drops entries older than the window, adds the current
    timestamp, then counts. If the count exceeds max_attempts the call
    returns ``allowed=False`` with the time until the oldest entry
    leaves the window.

    Lockout is a companion counter at ``<key>:lockout`` with an integer
    level and an expiring TTL that matches the step. The level is
    incremented by ``record_failure()`` and resets on ``clear_lockout()``.
    """

    def __init__(self, redis: Redis) -> None:  # type: ignore[type-arg]
        self._redis = redis

    async def hit(
        self,
        key: str,
        *,
        max_attempts: int,
        window_seconds: int,
    ) -> RateLimitResult:
        """Count this attempt and return whether it is allowed."""
        now_ms = int(time.time() * 1000)
        window_start_ms = now_ms - (window_seconds * 1000)
        member = f"{now_ms}:{uuid.uuid4().hex}"

        pipe = self._redis.pipeline()
        pipe.zremrangebyscore(key, "-inf", window_start_ms)
        pipe.zadd(key, {member: now_ms})
        pipe.zcard(key)
        pipe.expire(key, window_seconds)
        results = await pipe.execute()

        count: int = results[2]

        if count > max_attempts:
            # Fetch oldest entry to compute retry-after
            oldest_entries = await self._redis.zrange(key, 0, 0, withscores=True)
            if oldest_entries:
                raw_member, oldest_score = oldest_entries[0]
                oldest_score_ms = int(oldest_score)
                window_ms = window_seconds * 1000
                retry_after_ms = oldest_score_ms + window_ms - now_ms
                retry_after = max(1, int(retry_after_ms / 1000))
            else:
                retry_after = 1
            return RateLimitResult(
                allowed=False,
                remaining=0,
                retry_after_seconds=retry_after,
                current_count=count,
            )

        return RateLimitResult(
            allowed=True,
            remaining=max_attempts - count,
            retry_after_seconds=0,
            current_count=count,
        )

    async def reset(self, key: str) -> None:
        """Drop the sliding-window key entirely."""
        await self._redis.delete(key)

    async def lockout_status(self, key: str) -> LockoutState:
        """Return the current lockout level and unlock time (if any)."""
        lockout_key = f"{key}:lockout"
        raw = await self._redis.get(lockout_key)
        if raw is None:
            return LockoutState(level=0, locked_until=None)

        level = int(raw.decode() if isinstance(raw, bytes) else raw)
        ttl = await self._redis.ttl(lockout_key)
        if ttl <= 0:
            # Key exists but TTL already expired or persistent
            return LockoutState(level=level, locked_until=None)

        locked_until = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        return LockoutState(level=level, locked_until=locked_until)

    async def record_failure(
        self,
        key: str,
        *,
        steps: list[int],
    ) -> LockoutState:
        """Increment the lockout level for this key. Sets TTL to
        ``steps[min(level, len(steps)) - 1]`` seconds.

        Level is 1-indexed. First failure -> level 1 with TTL steps[0].
        Sixth failure on top of an existing level-1 -> level 2 with
        TTL steps[1]. Capped at len(steps)."""
        lockout_key = f"{key}:lockout"
        level = await self._redis.incr(lockout_key)
        step_index = min(level, len(steps)) - 1
        ttl = steps[step_index]
        await self._redis.expire(lockout_key, ttl)
        locked_until = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        logger.info("rate_limit.lockout_recorded", key=key, level=level, ttl=ttl)
        return LockoutState(level=level, locked_until=locked_until)

    async def clear_lockout(self, key: str) -> None:
        """Drop both the sliding-window key and the lockout counter."""
        lockout_key = f"{key}:lockout"
        await self._redis.delete(key, lockout_key)


def build_rate_limiter_from_url(url: str) -> RateLimiter:
    """Convenience factory for production wiring (T1.W2.8 lifespan)."""
    client = Redis.from_url(url, decode_responses=False)
    return RateLimiter(client)


def login_rate_key(email: str, ip: str) -> str:
    return f"auth:rate:login:{email.strip().lower()}:{ip}"


def forgot_rate_key(email: str, ip: str) -> str:
    return f"auth:rate:forgot:{email.strip().lower()}:{ip}"

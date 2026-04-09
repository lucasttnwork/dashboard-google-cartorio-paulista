"""Redis-backed rate limiter with sliding window + escalating lockout.

Filled in by T1.W2.4 with ``RateLimiter``, ``RateLimitResult``,
``LockoutState``. Implementation uses Redis sorted sets
(``ZADD`` / ``ZREMRANGEBYSCORE`` / ``ZCARD``) keyed by
``auth:rate:<scope>:<email_lower>:<ip>`` with a companion lockout
counter at ``auth:lockout:<scope>:<email_lower>:<ip>``.
"""

from __future__ import annotations

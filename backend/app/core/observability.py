"""Sentry initialization and the request-id middleware.

Filled in by T1.W2.8. Exposes `init_sentry(dsn, env, release)` and
`RequestIdMiddleware` wired into `app/main.py` via the lifespan.
"""

from __future__ import annotations

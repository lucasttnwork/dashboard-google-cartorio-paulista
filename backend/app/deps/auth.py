"""Authentication + authorization FastAPI dependencies.

Filled in by T1.W2.5. Exposes:

- ``AuthenticatedUser`` dataclass
- ``get_current_user`` (reads cookies, validates JWT, loads role from DB,
  transparently refreshes on expiry)
- ``require_authenticated`` / ``require_role(*allowed)`` helpers
- ``get_supabase_auth``, ``get_rate_limiter``, ``get_redis`` accessor deps
"""

from __future__ import annotations

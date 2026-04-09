"""JWKS-backed JWT verification for Supabase-issued access tokens.

Filled in by T1.W2.2. Exposes `verify_access_token`, `warm_jwks_cache`,
and the `AccessTokenClaims` / `JWTValidationError` / `JWTExpiredError`
types that `app/deps/auth.py` depends on.
"""

from __future__ import annotations

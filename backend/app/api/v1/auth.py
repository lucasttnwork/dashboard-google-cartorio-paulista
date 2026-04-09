"""/api/v1/auth/* endpoints.

Filled in by T1.W2.6 (fan-in task). Depends on services/supabase_auth
(T1.W2.3), services/rate_limit (T1.W2.4), deps/auth (T1.W2.5), and
schemas/auth (this module's request/response models).

Endpoints:
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET  /api/v1/auth/me
- POST /api/v1/auth/refresh
- POST /api/v1/auth/forgot
- POST /api/v1/auth/reset
- GET  /api/v1/_debug/admin-only  (env != production only, AC-1.10)
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["auth"])

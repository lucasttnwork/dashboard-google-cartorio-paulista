"""HTTP relay to the Supabase Auth (gotrue) service.

Filled in by T1.W2.3 with ``SupabaseAuthClient`` (httpx.AsyncClient
wrapper), ``TokenResponse``, ``SupabaseUser``, ``SupabaseAuthError``.

Key-format constraint (research T1.W1.0d): new ``sb_*`` keys only go
in the ``apikey`` header. The ``Authorization: Bearer ...`` header is
reserved for the user's access token.
"""

from __future__ import annotations

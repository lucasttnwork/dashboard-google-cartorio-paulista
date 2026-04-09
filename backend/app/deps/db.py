"""Async SQLAlchemy session dependency.

Filled in by T1.W2.5. Exposes `get_session()` yielding an
`AsyncSession` bound to the engine stored on `app.state.db_engine`.
"""

from __future__ import annotations

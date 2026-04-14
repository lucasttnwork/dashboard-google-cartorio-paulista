"""Integration tests for GET /api/v1/collaborators/{id}/profile (Phase 3.7).

The profile endpoint joins reviews + review_collaborators + collaborators to
produce a single aggregated payload used by the frontend profile page. The
pre-existing ``test_collaborators_*.py`` files only create the collaborator
tables, so we use a dedicated fixture set with the richer DDL (mirroring
``test_metrics.py`` and ``test_reviews.py``) to exercise the real service.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SADeprecationWarning
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1 import collaborators as collab_module
from app.deps.auth import AuthenticatedUser, get_current_user, require_authenticated
from app.deps.db import get_session

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000077")
_ADMIN_EMAIL = "profile-test@cartorio.test"
_NOW = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)

_DDL = """
CREATE TABLE IF NOT EXISTS reviews (
    review_id       TEXT PRIMARY KEY,
    location_id     TEXT,
    rating          INTEGER,
    comment         TEXT,
    reviewer_name   TEXT,
    is_anonymous    INTEGER,
    create_time     TEXT,
    update_time     TEXT,
    reply_text      TEXT,
    reply_time      TEXT,
    review_url      TEXT,
    reviewer_id     TEXT,
    reviewer_url    TEXT,
    is_local_guide  INTEGER,
    reviewer_photo_url TEXT,
    original_language  TEXT,
    translated_text    TEXT,
    response_text      TEXT,
    response_time      TEXT,
    source             TEXT,
    collection_source  TEXT,
    collection_batch_id TEXT,
    processed_at       TEXT,
    last_checked_at    TEXT,
    last_seen_at       TEXT
);

CREATE TABLE IF NOT EXISTS review_labels (
    review_id          TEXT PRIMARY KEY,
    sentiment          TEXT,
    toxicity           REAL,
    is_enotariado      INTEGER,
    classifier_version TEXT
);

CREATE TABLE IF NOT EXISTS collaborators (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name  TEXT NOT NULL UNIQUE,
    aliases    TEXT NOT NULL DEFAULT '[]',
    department TEXT,
    position   TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1,
    user_id    TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_collaborators (
    review_id       TEXT NOT NULL,
    collaborator_id INTEGER NOT NULL,
    mention_snippet TEXT,
    match_score     REAL,
    context_found   TEXT,
    PRIMARY KEY (review_id, collaborator_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id    TEXT PRIMARY KEY,
    role       TEXT NOT NULL,
    disabled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


# ---------------------------------------------------------------------------
# SQLite compat patches
# ---------------------------------------------------------------------------


def _patch_models_for_sqlite() -> None:
    """Replace Pg-specific column types and strip ``schema='public'``."""
    import json as _json
    import warnings

    from sqlalchemy import Text as SaText, TypeDecorator
    from sqlalchemy.orm import relationship

    class JSONList(TypeDecorator):
        impl = SaText
        cache_ok = True

        def process_bind_param(self, value, dialect):
            if value is None:
                return "[]"
            return _json.dumps(value)

        def process_result_value(self, value, dialect):
            if value is None:
                return []
            return _json.loads(value)

    class UUIDStr(TypeDecorator):
        impl = SaText
        cache_ok = True

        def process_bind_param(self, value, dialect):
            if value is None:
                return None
            return str(value)

        def process_result_value(self, value, dialect):
            if value is None:
                return None
            return uuid.UUID(value)

    from app.db.models.collaborator import Collaborator, ReviewCollaborator
    from app.db.models.review import Review, ReviewLabel
    from app.db.models.user_profile import UserProfile

    for model in (Review, ReviewLabel, Collaborator, ReviewCollaborator, UserProfile):
        model.__table__.schema = None

    Collaborator.__table__.c.aliases.type = JSONList()
    Collaborator.__table__.c.user_id.type = UUIDStr()

    if not Review.__mapper__.relationships["mentions"].uselist:
        Review.__mapper__._props.pop("mentions", None)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", SADeprecationWarning)
            Review.__mapper__.add_property(
                "mentions",
                relationship(
                    "ReviewCollaborator",
                    primaryjoin="Review.review_id == foreign(ReviewCollaborator.review_id)",
                    uselist=True,
                    lazy="selectin",
                    viewonly=True,
                ),
            )


_patch_models_for_sqlite()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_admin() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=_ADMIN_ID,
        email=_ADMIN_EMAIL,
        role="admin",  # type: ignore[arg-type]
        created_at=_NOW,
        disabled_at=None,
    )


@pytest.fixture()
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        for stmt in _DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt))
    yield engine
    await engine.dispose()


@pytest.fixture()
async def db_session(db_engine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    async with maker() as session:
        yield session


@pytest.fixture()
def admin_user() -> AuthenticatedUser:
    return _make_admin()


def _make_app(
    *,
    db_session: AsyncSession,
    user: AuthenticatedUser | None = None,
    reject_auth: bool = False,
) -> FastAPI:
    test_app = FastAPI()
    test_app.include_router(
        collab_module.router, prefix="/api/v1/collaborators"
    )

    async def _session_dep() -> AsyncIterator[AsyncSession]:
        yield db_session

    test_app.dependency_overrides[get_session] = _session_dep

    if reject_auth:
        async def _deny() -> AuthenticatedUser:
            raise HTTPException(status_code=401, detail="not_authenticated")

        test_app.dependency_overrides[get_current_user] = _deny
        test_app.dependency_overrides[require_authenticated] = _deny
    else:
        if user is None:
            user = _make_admin()
        _user = user

        async def _user_dep() -> AuthenticatedUser:
            return _user

        test_app.dependency_overrides[get_current_user] = _user_dep
        test_app.dependency_overrides[require_authenticated] = _user_dep

    return test_app


@pytest.fixture()
def app(db_session: AsyncSession, admin_user: AuthenticatedUser) -> FastAPI:
    return _make_app(db_session=db_session, user=admin_user)


@pytest.fixture()
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _insert_review(
    session: AsyncSession,
    review_id: str,
    *,
    rating: int = 5,
    comment: str | None = "ok",
    reviewer_name: str = "Test User",
    create_time: str = "2026-03-15T10:00:00+00:00",
) -> None:
    await session.execute(
        text(
            "INSERT INTO reviews "
            "(review_id, location_id, rating, comment, reviewer_name, "
            " is_anonymous, create_time) "
            "VALUES (:rid, 'loc-1', :rat, :com, :rn, 0, :ct)"
        ),
        {
            "rid": review_id,
            "rat": rating,
            "com": comment,
            "rn": reviewer_name,
            "ct": create_time,
        },
    )


async def _insert_collaborator(
    session: AsyncSession,
    collab_id: int,
    full_name: str,
    *,
    is_active: bool = True,
    department: str | None = "E-notariado",
    position: str | None = None,
) -> None:
    now = _NOW.isoformat()
    await session.execute(
        text(
            "INSERT INTO collaborators "
            "(id, full_name, aliases, department, position, is_active, "
            " created_at, updated_at) "
            "VALUES (:cid, :fn, '[]', :dept, :pos, :active, :now, :now)"
        ),
        {
            "cid": collab_id,
            "fn": full_name,
            "dept": department,
            "pos": position,
            "active": int(is_active),
            "now": now,
        },
    )


async def _insert_mention(
    session: AsyncSession,
    review_id: str,
    collaborator_id: int,
    *,
    snippet: str | None = None,
    score: float | None = None,
) -> None:
    await session.execute(
        text(
            "INSERT INTO review_collaborators "
            "(review_id, collaborator_id, mention_snippet, match_score) "
            "VALUES (:rid, :cid, :snip, :score)"
        ),
        {"rid": review_id, "cid": collaborator_id, "snip": snippet, "score": score},
    )


# ===========================================================================
# Tests
# ===========================================================================


class TestCollaboratorProfile:
    """GET /api/v1/collaborators/{id}/profile."""

    async def test_profile_returns_full_shape(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Valid id returns a payload with every documented field present."""
        await _insert_collaborator(
            db_session, 10, "Ana Costa", department="E-notariado", position="Senior"
        )
        # 3 mentions in different months to populate distribution and windows
        await _insert_review(
            db_session, "p-1", rating=5, comment="Ana was great",
            create_time="2026-03-05T10:00:00+00:00",
        )
        await _insert_review(
            db_session, "p-2", rating=4, comment="Good",
            create_time="2026-03-15T10:00:00+00:00",
        )
        await _insert_review(
            db_session, "p-3", rating=5, comment="Excellent",
            create_time="2026-02-20T10:00:00+00:00",
        )
        await _insert_mention(db_session, "p-1", 10, snippet="Ana was great", score=0.9)
        await _insert_mention(db_session, "p-2", 10, snippet="Good job", score=0.8)
        await _insert_mention(db_session, "p-3", 10)
        await db_session.commit()

        resp = await client.get("/api/v1/collaborators/10/profile")
        assert resp.status_code == 200
        body = resp.json()

        # Every field of CollaboratorProfileOut must be present
        expected_fields = {
            "id", "full_name", "aliases", "department", "position", "is_active",
            "total_mentions", "avg_rating", "ranking", "total_collaborators_active",
            "mentions_last_6m", "mentions_prev_6m",
            "avg_rating_last_6m", "avg_rating_prev_6m",
            "rating_distribution", "monthly", "recent_reviews",
        }
        assert expected_fields.issubset(body.keys())

        assert body["id"] == 10
        assert body["full_name"] == "Ana Costa"
        assert body["department"] == "E-notariado"
        assert body["position"] == "Senior"
        assert body["is_active"] is True
        assert body["total_mentions"] == 3
        # avg rating = (5+4+5)/3 ≈ 4.67
        assert body["avg_rating"] == pytest.approx(4.67, abs=0.01)
        assert isinstance(body["rating_distribution"], dict)
        assert isinstance(body["recent_reviews"], list)
        assert len(body["recent_reviews"]) == 3
        # recent_reviews are ordered by create_time desc
        recent_ids = [r["review_id"] for r in body["recent_reviews"]]
        assert recent_ids[0] == "p-2"  # 2026-03-15 is the newest

    async def test_profile_not_found_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Unknown collaborator id returns 404 with ``not_found`` detail."""
        resp = await client.get("/api/v1/collaborators/99999999/profile")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "not_found"

    async def test_profile_ranking_within_bounds(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Ranking is either None or between 1 and total_collaborators_active."""
        # Three active collaborators, different mention counts.
        await _insert_collaborator(db_session, 1, "Alpha")
        await _insert_collaborator(db_session, 2, "Beta")
        await _insert_collaborator(db_session, 3, "Gamma")

        for i in range(3):
            await _insert_review(
                db_session, f"a-{i}", rating=5,
                create_time=f"2026-03-{10 + i:02d}T10:00:00+00:00",
            )
            await _insert_mention(db_session, f"a-{i}", 1)
        for i in range(2):
            await _insert_review(
                db_session, f"b-{i}", rating=5,
                create_time=f"2026-03-{20 + i:02d}T10:00:00+00:00",
            )
            await _insert_mention(db_session, f"b-{i}", 2)
        await _insert_review(
            db_session, "c-0", rating=4,
            create_time="2026-03-25T10:00:00+00:00",
        )
        await _insert_mention(db_session, "c-0", 3)
        await db_session.commit()

        resp = await client.get("/api/v1/collaborators/2/profile")
        assert resp.status_code == 200
        body = resp.json()
        total_active = body["total_collaborators_active"]
        assert total_active == 3
        ranking = body["ranking"]
        assert ranking is None or (1 <= ranking <= total_active)
        # Alpha has the most mentions → Beta should be rank 2
        assert ranking == 2

    async def test_profile_rating_distribution_sums_to_total_mentions(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Sum of rating_distribution values equals total_mentions (>0 case)."""
        await _insert_collaborator(db_session, 55, "Distribution Tester")
        await _insert_review(
            db_session, "d-1", rating=5,
            create_time="2026-03-01T10:00:00+00:00",
        )
        await _insert_review(
            db_session, "d-2", rating=5,
            create_time="2026-03-02T10:00:00+00:00",
        )
        await _insert_review(
            db_session, "d-3", rating=4,
            create_time="2026-03-03T10:00:00+00:00",
        )
        await _insert_review(
            db_session, "d-4", rating=1,
            create_time="2026-03-04T10:00:00+00:00",
        )
        for rid in ("d-1", "d-2", "d-3", "d-4"):
            await _insert_mention(db_session, rid, 55)
        await db_session.commit()

        resp = await client.get("/api/v1/collaborators/55/profile")
        assert resp.status_code == 200
        body = resp.json()
        dist = body["rating_distribution"]
        assert set(dist.keys()) == {"1", "2", "3", "4", "5"}
        assert body["total_mentions"] == 4
        assert sum(dist.values()) == body["total_mentions"]
        assert dist["5"] == 2
        assert dist["4"] == 1
        assert dist["1"] == 1

"""Integration tests for /api/v1/reviews/* endpoints (Phase 3).

Tests review listing (cursor-based pagination, filters) and detail
retrieval.  Uses an in-memory SQLite database with raw DDL; ORM
Postgres-specific types are patched to SQLite equivalents.

Requires: pytest-asyncio >= 0.24, httpx, aiosqlite.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SADeprecationWarning
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1 import reviews as reviews_module
from app.deps.auth import AuthenticatedUser, get_current_user, require_authenticated
from app.deps.db import get_session

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
_ADMIN_EMAIL = "reviewer-test@cartorio.test"
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
"""


# ---------------------------------------------------------------------------
# SQLite compat patches
# ---------------------------------------------------------------------------


def _patch_models_for_sqlite():
    """Replace Pg-specific column types and strip ``schema='public'``.

    Also fixes the ``Review.mentions`` relationship whose bare ``Mapped[list]``
    annotation (without generic parameter) causes SQLAlchemy to infer
    ``uselist=False``.  We re-add the property with ``uselist=True`` so that
    the relationship correctly returns a list in the test environment.
    """
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

    from app.db.models.collaborator import Collaborator, ReviewCollaborator
    from app.db.models.review import Review, ReviewLabel

    for model in (Review, ReviewLabel, Collaborator, ReviewCollaborator):
        model.__table__.schema = None

    # Collaborator.aliases: ARRAY(Text) -> JSONList
    Collaborator.__table__.c.aliases.type = JSONList()

    # Fix Review.mentions: bare Mapped[list] resolves uselist=False in SA 2.x.
    # Re-add with explicit uselist=True so selectinload returns a list.
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
    """Build a minimal FastAPI app with the reviews router.

    When *reject_auth* is True the auth dependency raises 401 to simulate
    an unauthenticated request (without needing Supabase/Redis on app.state).
    """
    test_app = FastAPI()
    test_app.include_router(reviews_module.router, prefix="/api/v1/reviews")

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


@pytest.fixture()
def app_no_auth(db_session: AsyncSession) -> FastAPI:
    """App whose auth dep always raises 401 (simulates missing cookies)."""
    return _make_app(db_session=db_session, reject_auth=True)


@pytest.fixture()
async def client_no_auth(app_no_auth: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app_no_auth)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Helper: insert test data via raw SQL
# ---------------------------------------------------------------------------


async def _insert_review(
    session: AsyncSession,
    review_id: str,
    *,
    rating: int = 5,
    comment: str | None = None,
    reviewer_name: str = "Test User",
    create_time: str = "2026-03-15T10:00:00+00:00",
    reply_text: str | None = None,
    location_id: str = "loc-1",
) -> None:
    await session.execute(
        text(
            "INSERT INTO reviews "
            "(review_id, location_id, rating, comment, reviewer_name, "
            " is_anonymous, create_time, reply_text) "
            "VALUES (:rid, :loc, :rat, :com, :rn, 0, :ct, :rt)"
        ),
        {
            "rid": review_id,
            "loc": location_id,
            "rat": rating,
            "com": comment,
            "rn": reviewer_name,
            "ct": create_time,
            "rt": reply_text,
        },
    )


async def _insert_label(
    session: AsyncSession,
    review_id: str,
    *,
    sentiment: str = "pos",
    is_enotariado: bool = False,
) -> None:
    await session.execute(
        text(
            "INSERT INTO review_labels (review_id, sentiment, is_enotariado) "
            "VALUES (:rid, :sent, :enot)"
        ),
        {"rid": review_id, "sent": sentiment, "enot": int(is_enotariado)},
    )


async def _insert_collaborator(
    session: AsyncSession,
    collab_id: int,
    full_name: str,
    *,
    is_active: bool = True,
) -> None:
    now = _NOW.isoformat()
    await session.execute(
        text(
            "INSERT INTO collaborators (id, full_name, aliases, is_active, created_at, updated_at) "
            "VALUES (:cid, :fn, '[]', :active, :now, :now)"
        ),
        {"cid": collab_id, "fn": full_name, "active": int(is_active), "now": now},
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
            "INSERT INTO review_collaborators (review_id, collaborator_id, mention_snippet, match_score) "
            "VALUES (:rid, :cid, :snip, :score)"
        ),
        {"rid": review_id, "cid": collaborator_id, "snip": snippet, "score": score},
    )


# ===========================================================================
# Tests
# ===========================================================================


class TestListReviewsAuth:
    """Auth requirement for GET /api/v1/reviews/."""

    async def test_list_reviews_requires_auth(
        self, client_no_auth: AsyncClient
    ) -> None:
        """Request without any cookies must return 401."""
        resp = await client_no_auth.get("/api/v1/reviews/")
        assert resp.status_code == 401


class TestListReviewsEmpty:
    """Empty database scenarios."""

    async def test_list_reviews_empty(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/reviews/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0
        assert body["has_more"] is False
        assert body["next_cursor"] is None


class TestListReviewsData:
    """Listing reviews with various data and filters."""

    async def test_list_reviews_returns_data(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Insert 3 reviews; endpoint returns all of them."""
        for i in range(3):
            await _insert_review(
                db_session,
                f"rev-{i}",
                rating=5 - i,
                comment=f"Comment {i}",
                create_time=f"2026-03-{15 + i:02d}T10:00:00+00:00",
            )
        await db_session.commit()

        resp = await client.get("/api/v1/reviews/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert len(body["items"]) == 3
        # Verify response shape
        item = body["items"][0]
        assert "review_id" in item
        assert "rating" in item
        assert "comment" in item
        assert "reviewer_name" in item
        assert "create_time" in item
        assert "collaborator_names" in item

    async def test_list_reviews_filter_rating(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Filter by rating=5 returns only 5-star reviews."""
        await _insert_review(db_session, "rev-5star", rating=5, comment="Great!")
        await _insert_review(db_session, "rev-3star", rating=3, comment="OK")
        await _insert_review(db_session, "rev-1star", rating=1, comment="Bad")
        await db_session.commit()

        resp = await client.get("/api/v1/reviews/?rating=5")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert len(body["items"]) == 1
        assert body["items"][0]["rating"] == 5
        assert body["items"][0]["review_id"] == "rev-5star"

    async def test_list_reviews_filter_search(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Search by comment text substring."""
        await _insert_review(
            db_session, "rev-a", comment="Excellent notary service"
        )
        await _insert_review(
            db_session, "rev-b", comment="Terrible experience"
        )
        await db_session.commit()

        resp = await client.get("/api/v1/reviews/?search=notary")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["review_id"] == "rev-a"

    async def test_list_reviews_cursor_pagination(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Insert 5 reviews, paginate with limit=2, verify cursor works."""
        for i in range(5):
            await _insert_review(
                db_session,
                f"rev-page-{i}",
                rating=5,
                create_time=f"2026-03-{10 + i:02d}T10:00:00+00:00",
            )
        await db_session.commit()

        # Page 1
        resp1 = await client.get("/api/v1/reviews/?limit=2")
        assert resp1.status_code == 200
        body1 = resp1.json()
        assert body1["total"] == 5
        assert len(body1["items"]) == 2
        assert body1["has_more"] is True
        assert body1["next_cursor"] is not None

        # Page 2
        resp2 = await client.get(
            f"/api/v1/reviews/?limit=2&cursor={body1['next_cursor']}"
        )
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert len(body2["items"]) == 2
        assert body2["has_more"] is True

        # Page 3 (last)
        resp3 = await client.get(
            f"/api/v1/reviews/?limit=2&cursor={body2['next_cursor']}"
        )
        assert resp3.status_code == 200
        body3 = resp3.json()
        assert len(body3["items"]) == 1
        assert body3["has_more"] is False

        # All review IDs across pages should be unique
        all_ids = (
            [it["review_id"] for it in body1["items"]]
            + [it["review_id"] for it in body2["items"]]
            + [it["review_id"] for it in body3["items"]]
        )
        assert len(set(all_ids)) == 5

    async def test_list_reviews_with_labels(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Review with a sentiment label returns label data in response."""
        await _insert_review(db_session, "rev-labeled", rating=5)
        await _insert_label(
            db_session, "rev-labeled", sentiment="pos", is_enotariado=True
        )
        await db_session.commit()

        resp = await client.get("/api/v1/reviews/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 1
        item = body["items"][0]
        assert item["sentiment"] == "pos"
        assert item["is_enotariado"] is True

    async def test_list_reviews_with_mentions(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Review with collaborator mentions includes names in response."""
        await _insert_review(db_session, "rev-mention", rating=4)
        await _insert_collaborator(db_session, 1, "Maria Silva")
        await _insert_mention(
            db_session, "rev-mention", 1, snippet="Maria was great"
        )
        await db_session.commit()

        resp = await client.get("/api/v1/reviews/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 1
        assert "Maria Silva" in body["items"][0]["collaborator_names"]


class TestGetReviewDetail:
    """GET /api/v1/reviews/{review_id} detail endpoint."""

    async def test_get_review_detail(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Single review with full detail, labels, and mentions."""
        await _insert_review(
            db_session,
            "rev-detail",
            rating=5,
            comment="Amazing service",
            reply_text="Thank you!",
        )
        await _insert_label(
            db_session, "rev-detail", sentiment="pos", is_enotariado=False
        )
        await _insert_collaborator(db_session, 10, "Carlos Souza")
        await _insert_mention(
            db_session, "rev-detail", 10, snippet="Carlos helped me", score=0.95
        )
        await db_session.commit()

        resp = await client.get("/api/v1/reviews/rev-detail")
        assert resp.status_code == 200
        body = resp.json()
        assert body["review_id"] == "rev-detail"
        assert body["rating"] == 5
        assert body["comment"] == "Amazing service"
        assert body["reply_text"] == "Thank you!"
        assert body["sentiment"] == "pos"
        # Detail-specific fields
        assert "mentions" in body
        assert len(body["mentions"]) == 1
        mention = body["mentions"][0]
        assert mention["collaborator_id"] == 10
        assert mention["collaborator_name"] == "Carlos Souza"
        assert mention["mention_snippet"] == "Carlos helped me"
        assert mention["match_score"] == 0.95

    async def test_get_review_not_found(self, client: AsyncClient) -> None:
        """Non-existent review_id returns 404."""
        resp = await client.get("/api/v1/reviews/nonexistent-id")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "not_found"

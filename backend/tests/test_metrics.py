"""Integration tests for /api/v1/metrics/* endpoints (Phase 3).

Tests overview KPIs, monthly trends, and per-collaborator mention
breakdowns.  Uses an in-memory SQLite database for the overview
endpoint (which uses ORM-level aggregation compatible with SQLite
3.30+).  The trends and collaborator-mentions endpoints rely on
Postgres-specific SQL (date_trunc, interval), so those are tested
via service-layer mocks to verify HTTP/schema correctness.

Requires: pytest-asyncio >= 0.24, httpx, aiosqlite.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1 import metrics as metrics_module
from app.deps.auth import AuthenticatedUser, get_current_user, require_authenticated
from app.deps.db import get_session
from app.schemas.metrics import (
    CollaboratorMentionOut,
    CollaboratorMentionsOut,
    CollaboratorMonthData,
    MetricsOverviewOut,
    MonthData,
    TrendsOut,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000088")
_ADMIN_EMAIL = "metrics-test@cartorio.test"
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
    """Replace Pg-specific column types and strip ``schema='public'``."""
    import json as _json
    import warnings

    from sqlalchemy import Text as SaText, TypeDecorator
    from sqlalchemy.exc import SADeprecationWarning
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

    Collaborator.__table__.c.aliases.type = JSONList()

    # Fix Review.mentions uselist (see test_reviews.py for explanation)
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
    test_app.include_router(metrics_module.router, prefix="/api/v1/metrics")

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
# Helpers: insert test data via raw SQL
# ---------------------------------------------------------------------------


async def _insert_review(
    session: AsyncSession,
    review_id: str,
    *,
    rating: int = 5,
    comment: str | None = None,
    create_time: str = "2026-03-15T10:00:00+00:00",
    reply_text: str | None = None,
    location_id: str = "loc-1",
) -> None:
    await session.execute(
        text(
            "INSERT INTO reviews "
            "(review_id, location_id, rating, comment, reviewer_name, "
            " is_anonymous, create_time, reply_text) "
            "VALUES (:rid, :loc, :rat, :com, 'User', 0, :ct, :rt)"
        ),
        {
            "rid": review_id,
            "loc": location_id,
            "rat": rating,
            "com": comment,
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
) -> None:
    await session.execute(
        text(
            "INSERT INTO review_collaborators (review_id, collaborator_id) "
            "VALUES (:rid, :cid)"
        ),
        {"rid": review_id, "cid": collaborator_id},
    )


# ===========================================================================
# 1. Overview KPIs  (/api/v1/metrics/overview)
# ===========================================================================


class TestOverviewAuth:
    """Auth requirement for GET /api/v1/metrics/overview."""

    async def test_overview_requires_auth(
        self, client_no_auth: AsyncClient
    ) -> None:
        resp = await client_no_auth.get("/api/v1/metrics/overview")
        assert resp.status_code == 401


class TestOverviewEmpty:
    """Overview with no reviews in the database."""

    async def test_overview_empty(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_reviews"] == 0
        assert body["avg_rating"] == 0.0
        assert body["five_star_pct"] == 0.0
        assert body["one_star_pct"] == 0.0
        assert body["total_with_comment"] == 0
        assert body["total_with_reply"] == 0
        assert body["total_enotariado"] == 0
        assert body["total_collaborators_active"] == 0
        assert body["total_mentions"] == 0


class TestOverviewWithData:
    """Overview with reviews inserted into the database."""

    async def test_overview_with_data(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Insert reviews with various attributes and verify KPIs."""
        # 3 reviews: 5-star with comment+reply, 5-star no comment, 1-star with comment
        await _insert_review(
            db_session, "rev-1", rating=5, comment="Great!", reply_text="Thanks!"
        )
        await _insert_review(db_session, "rev-2", rating=5)
        await _insert_review(db_session, "rev-3", rating=1, comment="Bad")

        # Labels: rev-1 is e-notariado
        await _insert_label(db_session, "rev-1", is_enotariado=True)
        await _insert_label(db_session, "rev-3", sentiment="neg", is_enotariado=False)

        # Active collaborator + mention
        await _insert_collaborator(db_session, 1, "Ana Costa")
        await _insert_mention(db_session, "rev-1", 1)
        await db_session.commit()

        resp = await client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        body = resp.json()

        assert body["total_reviews"] == 3
        # avg = (5+5+1)/3 = 3.67
        assert body["avg_rating"] == pytest.approx(3.67, abs=0.01)
        # five_star_pct = 2/3 * 100 = 66.67
        assert body["five_star_pct"] == pytest.approx(66.67, abs=0.01)
        # one_star_pct = 1/3 * 100 = 33.33
        assert body["one_star_pct"] == pytest.approx(33.33, abs=0.01)
        assert body["total_with_comment"] == 2  # rev-1 and rev-3
        assert body["total_with_reply"] == 1  # rev-1
        assert body["total_enotariado"] == 1  # rev-1
        assert body["avg_rating_enotariado"] == 5.0  # only rev-1 is e-notariado
        assert body["total_collaborators_active"] == 1
        assert body["total_mentions"] == 1
        # Period should be set
        assert body["period_start"] != ""
        assert body["period_end"] != ""

    async def test_overview_date_filter(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Date filters restrict the period of reviews counted."""
        await _insert_review(
            db_session,
            "rev-jan",
            rating=5,
            create_time="2026-01-15T10:00:00+00:00",
        )
        await _insert_review(
            db_session,
            "rev-mar",
            rating=3,
            create_time="2026-03-15T10:00:00+00:00",
        )
        await db_session.commit()

        # Filter to March only
        resp = await client.get(
            "/api/v1/metrics/overview?date_from=2026-03-01&date_to=2026-03-31"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_reviews"] == 1
        assert body["avg_rating"] == 3.0


# ===========================================================================
# 2. Monthly Trends  (/api/v1/metrics/trends)
# ===========================================================================


class TestTrendsAuth:
    """Auth requirement."""

    async def test_trends_requires_auth(
        self, client_no_auth: AsyncClient
    ) -> None:
        resp = await client_no_auth.get("/api/v1/metrics/trends")
        assert resp.status_code == 401


class TestTrendsEmpty:
    """Trends with empty data (mocked service)."""

    async def test_trends_empty(self, client: AsyncClient) -> None:
        """When there are no reviews, trends returns an empty month list."""
        mock_return = TrendsOut(months=[])
        with patch(
            "app.api.v1.metrics.svc.get_trends",
            new_callable=AsyncMock,
            return_value=mock_return,
        ):
            resp = await client.get("/api/v1/metrics/trends")
        assert resp.status_code == 200
        body = resp.json()
        assert body["months"] == []


class TestTrendsWithData:
    """Trends with mocked data to verify HTTP response shape."""

    async def test_trends_with_data(self, client: AsyncClient) -> None:
        """Service returns monthly breakdown; endpoint serializes correctly."""
        mock_return = TrendsOut(
            months=[
                MonthData(
                    month="2026-01-01",
                    total_reviews=10,
                    avg_rating=4.5,
                    reviews_enotariado=3,
                    avg_rating_enotariado=4.8,
                ),
                MonthData(
                    month="2026-02-01",
                    total_reviews=15,
                    avg_rating=4.2,
                    reviews_enotariado=5,
                    avg_rating_enotariado=4.6,
                ),
                MonthData(
                    month="2026-03-01",
                    total_reviews=20,
                    avg_rating=4.0,
                    reviews_enotariado=8,
                    avg_rating_enotariado=None,
                ),
            ]
        )
        with patch(
            "app.api.v1.metrics.svc.get_trends",
            new_callable=AsyncMock,
            return_value=mock_return,
        ):
            resp = await client.get("/api/v1/metrics/trends?months=3")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["months"]) == 3
        # Verify shape of each month entry
        m = body["months"][0]
        assert m["month"] == "2026-01-01"
        assert m["total_reviews"] == 10
        assert m["avg_rating"] == 4.5
        assert m["reviews_enotariado"] == 3
        assert m["avg_rating_enotariado"] == 4.8
        # Third month has null avg_rating_enotariado
        assert body["months"][2]["avg_rating_enotariado"] is None

    async def test_trends_passes_query_params(self, client: AsyncClient) -> None:
        """Verify query params (months, location_id) reach the service."""
        mock_fn = AsyncMock(return_value=TrendsOut(months=[]))
        with patch("app.api.v1.metrics.svc.get_trends", mock_fn):
            resp = await client.get(
                "/api/v1/metrics/trends?months=6&location_id=loc-abc"
            )
        assert resp.status_code == 200
        mock_fn.assert_awaited_once()
        call_kwargs = mock_fn.call_args
        # The first positional arg is the session; keyword args follow
        assert call_kwargs.kwargs["months"] == 6
        assert call_kwargs.kwargs["location_id"] == "loc-abc"


# ===========================================================================
# 3. Collaborator Mentions  (/api/v1/metrics/collaborator-mentions)
# ===========================================================================


class TestCollaboratorMentionsAuth:
    """Auth requirement."""

    async def test_collaborator_mentions_requires_auth(
        self, client_no_auth: AsyncClient
    ) -> None:
        resp = await client_no_auth.get("/api/v1/metrics/collaborator-mentions")
        assert resp.status_code == 401


class TestCollaboratorMentionsEmpty:
    """Empty collaborator mentions."""

    async def test_collaborator_mentions_empty(self, client: AsyncClient) -> None:
        mock_return = CollaboratorMentionsOut(collaborators=[])
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions",
            new_callable=AsyncMock,
            return_value=mock_return,
        ):
            resp = await client.get("/api/v1/metrics/collaborator-mentions")
        assert resp.status_code == 200
        body = resp.json()
        assert body["collaborators"] == []


class TestCollaboratorMentionsWithData:
    """Collaborator mentions with mocked data."""

    async def test_collaborator_mentions_with_data(
        self, client: AsyncClient
    ) -> None:
        """Service returns per-collaborator data; endpoint serializes it."""
        mock_return = CollaboratorMentionsOut(
            collaborators=[
                CollaboratorMentionOut(
                    collaborator_id=1,
                    full_name="Maria Silva",
                    is_active=True,
                    total_mentions=12,
                    avg_rating_mentioned=4.7,
                    monthly=[
                        CollaboratorMonthData(
                            month="2026-03-01",
                            mentions=5,
                            avg_rating=4.8,
                        ),
                        CollaboratorMonthData(
                            month="2026-02-01",
                            mentions=7,
                            avg_rating=4.6,
                        ),
                    ],
                ),
                CollaboratorMentionOut(
                    collaborator_id=2,
                    full_name="Carlos Souza",
                    is_active=True,
                    total_mentions=8,
                    avg_rating_mentioned=4.2,
                    monthly=[],
                ),
            ]
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions",
            new_callable=AsyncMock,
            return_value=mock_return,
        ):
            resp = await client.get("/api/v1/metrics/collaborator-mentions")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["collaborators"]) == 2
        c1 = body["collaborators"][0]
        assert c1["collaborator_id"] == 1
        assert c1["full_name"] == "Maria Silva"
        assert c1["is_active"] is True
        assert c1["total_mentions"] == 12
        assert c1["avg_rating_mentioned"] == 4.7
        assert len(c1["monthly"]) == 2
        assert c1["monthly"][0]["month"] == "2026-03-01"
        assert c1["monthly"][0]["mentions"] == 5

    async def test_collaborator_mentions_exclude_inactive(
        self, client: AsyncClient
    ) -> None:
        """Default request (include_inactive=false) passes param correctly."""
        mock_fn = AsyncMock(
            return_value=CollaboratorMentionsOut(collaborators=[])
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get("/api/v1/metrics/collaborator-mentions")
        assert resp.status_code == 200
        mock_fn.assert_awaited_once()
        assert mock_fn.call_args.kwargs["include_inactive"] is False

    async def test_collaborator_mentions_include_inactive(
        self, client: AsyncClient
    ) -> None:
        """Explicit include_inactive=true is forwarded to the service."""
        mock_fn = AsyncMock(
            return_value=CollaboratorMentionsOut(collaborators=[])
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get(
                "/api/v1/metrics/collaborator-mentions?include_inactive=true"
            )
        assert resp.status_code == 200
        mock_fn.assert_awaited_once()
        assert mock_fn.call_args.kwargs["include_inactive"] is True


# ===========================================================================
# 4. Phase 3.7 — compare_previous, rating_distribution, reply_rate_pct
# ===========================================================================


class TestOverviewComparePrevious:
    """``compare_previous=True`` returns a previous-period aggregation."""

    async def test_overview_compare_previous_returns_correct_window(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Window math: previous = [dt_from - duration, dt_from)."""
        # Primary window: 2026-04-01 .. 2026-06-30 (≈ 90 days).
        # Expected previous window: 2026-01-01 .. 2026-04-01.
        await _insert_review(
            db_session, "prev-1", rating=4, create_time="2026-02-10T10:00:00+00:00"
        )
        await _insert_review(
            db_session, "prev-2", rating=2, create_time="2026-03-20T10:00:00+00:00"
        )
        await _insert_review(
            db_session, "cur-1", rating=5, create_time="2026-04-15T10:00:00+00:00"
        )
        await _insert_review(
            db_session, "cur-2", rating=5, create_time="2026-05-10T10:00:00+00:00"
        )
        await _insert_review(
            db_session, "cur-3", rating=3, create_time="2026-06-01T10:00:00+00:00"
        )
        await db_session.commit()

        resp = await client.get(
            "/api/v1/metrics/overview"
            "?date_from=2026-04-01&date_to=2026-06-30&compare_previous=true"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["previous_period"] is not None
        prev = body["previous_period"]
        # Duration = 90 days; previous_from = 2026-04-01 - 90d = 2026-01-01
        assert prev["period_start"].startswith("2026-01-01")
        assert prev["period_end"].startswith("2026-04-01")
        # Only prev-1 and prev-2 fall inside the previous window
        assert prev["total_reviews"] == 2

    async def test_overview_compare_previous_none_when_missing_dates(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Without both date_from and date_to, previous_period is None."""
        await _insert_review(db_session, "any-1", rating=5)
        await db_session.commit()

        resp = await client.get(
            "/api/v1/metrics/overview?compare_previous=true"
        )
        assert resp.status_code == 200
        assert resp.json()["previous_period"] is None

    async def test_overview_compare_previous_delta_is_deterministic(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The delta (current - previous) is computable and stable."""
        # 1 review in previous window, 3 in current window.
        # Primary: 2026-04-01..2026-04-30 (29d). Previous: 2026-03-03..2026-04-01.
        await _insert_review(
            db_session, "prev-a", rating=5, create_time="2026-03-15T10:00:00+00:00"
        )
        for i, day in enumerate(("04-05", "04-15", "04-25")):
            await _insert_review(
                db_session,
                f"cur-{i}",
                rating=5,
                create_time=f"2026-{day}T10:00:00+00:00",
            )
        await db_session.commit()

        resp = await client.get(
            "/api/v1/metrics/overview"
            "?date_from=2026-04-01&date_to=2026-04-30&compare_previous=true"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_reviews"] == 3
        assert body["previous_period"]["total_reviews"] == 1
        delta = body["total_reviews"] - body["previous_period"]["total_reviews"]
        assert delta == 2


class TestRatingDistribution:
    """``rating_distribution`` dict sums to total, all keys always present."""

    async def test_rating_distribution_sums_to_total(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        await _insert_review(db_session, "r1", rating=5)
        await _insert_review(db_session, "r2", rating=5)
        await _insert_review(db_session, "r3", rating=4)
        await _insert_review(db_session, "r4", rating=3)
        await _insert_review(db_session, "r5", rating=1)
        await db_session.commit()

        resp = await client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        body = resp.json()
        dist = body["rating_distribution"]
        assert set(dist.keys()) == {"1", "2", "3", "4", "5"}
        assert sum(dist.values()) == body["total_reviews"] == 5
        assert dist["5"] == 2
        assert dist["4"] == 1
        assert dist["3"] == 1
        assert dist["2"] == 0
        assert dist["1"] == 1

    async def test_rating_distribution_empty_has_all_zero_keys(
        self, client: AsyncClient
    ) -> None:
        resp = await client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        dist = resp.json()["rating_distribution"]
        assert dist == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}


class TestReplyRatePct:
    """``reply_rate_pct`` bounds and zero-reply scenarios."""

    async def test_reply_rate_pct_between_zero_and_hundred(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        await _insert_review(db_session, "rr-1", rating=5, reply_text="Thanks!")
        await _insert_review(db_session, "rr-2", rating=4, reply_text="Obrigado")
        await _insert_review(db_session, "rr-3", rating=3)
        await _insert_review(db_session, "rr-4", rating=2)
        await db_session.commit()

        resp = await client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        body = resp.json()
        assert 0.0 <= body["reply_rate_pct"] <= 100.0
        # 2 of 4 replied = 50.0
        assert body["reply_rate_pct"] == 50.0

    async def test_reply_rate_pct_zero_when_no_replies(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        await _insert_review(db_session, "nr-1", rating=5)
        await _insert_review(db_session, "nr-2", rating=3)
        await db_session.commit()

        resp = await client.get("/api/v1/metrics/overview")
        assert resp.status_code == 200
        assert resp.json()["reply_rate_pct"] == 0.0


# ===========================================================================
# 5. Phase 3.7 — /api/v1/metrics/data-status
# ===========================================================================


class TestDataStatus:
    """GET /api/v1/metrics/data-status freshness endpoint."""

    async def test_data_status_returns_all_fields(
        self, client: AsyncClient
    ) -> None:
        resp = await client.get("/api/v1/metrics/data-status")
        assert resp.status_code == 200
        body = resp.json()
        # All four documented fields are present (even if null)
        assert "last_review_date" in body
        assert "last_collection_run" in body
        assert "total_reviews" in body
        assert "days_since_last_review" in body
        assert body["total_reviews"] == 0

    async def test_data_status_days_since_last_review_nonnegative(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """With a review in the past, days_since_last_review is >= 0."""
        await _insert_review(
            db_session,
            "old-1",
            rating=4,
            create_time="2025-12-01T10:00:00+00:00",
        )
        await db_session.commit()

        resp = await client.get("/api/v1/metrics/data-status")
        assert resp.status_code == 200
        body = resp.json()
        assert body["last_review_date"] is not None
        assert body["total_reviews"] == 1
        assert body["days_since_last_review"] is not None
        assert body["days_since_last_review"] >= 0


# ===========================================================================
# 6. Phase 3.8 — trends date range + granularity; collaborator-mentions range
# ===========================================================================


class TestTrendsGranularity:
    """``granularity`` and ``date_from``/``date_to`` on GET /metrics/trends."""

    async def test_trends_default_granularity_is_month(
        self, client: AsyncClient
    ) -> None:
        """Default call forwards granularity='month' and no date bounds."""
        mock_fn = AsyncMock(
            return_value=TrendsOut(months=[], granularity="month")
        )
        with patch("app.api.v1.metrics.svc.get_trends", mock_fn):
            resp = await client.get("/api/v1/metrics/trends")
        assert resp.status_code == 200
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["granularity"] == "month"
        assert kwargs["date_from"] is None
        assert kwargs["date_to"] is None
        # Default relative window still intact.
        assert kwargs["months"] == 12
        # Echo field is present in the serialized response.
        assert resp.json()["granularity"] == "month"

    async def test_trends_granularity_day_shape(
        self, client: AsyncClient
    ) -> None:
        """Day-granularity response exposes ``day`` and omits ``month``."""
        mock_return = TrendsOut(
            granularity="day",
            months=[
                MonthData(
                    day="2026-02-01",
                    total_reviews=3,
                    avg_rating=4.5,
                    reviews_enotariado=1,
                    avg_rating_enotariado=5.0,
                ),
                MonthData(
                    day="2026-02-02",
                    total_reviews=5,
                    avg_rating=4.2,
                    reviews_enotariado=2,
                    avg_rating_enotariado=4.5,
                ),
            ],
        )
        with patch(
            "app.api.v1.metrics.svc.get_trends",
            new_callable=AsyncMock,
            return_value=mock_return,
        ):
            resp = await client.get(
                "/api/v1/metrics/trends?granularity=day"
                "&date_from=2026-02-01&date_to=2026-02-02"
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["granularity"] == "day"
        assert len(body["months"]) == 2
        first = body["months"][0]
        assert first["day"] == "2026-02-01"
        assert first["month"] is None
        assert first["total_reviews"] == 3

    async def test_trends_granularity_day_passes_date_range(
        self, client: AsyncClient
    ) -> None:
        """A 28-day range of day buckets reaches the service with both bounds."""
        days = [
            MonthData(
                day=f"2026-02-{d:02d}",
                total_reviews=1,
                avg_rating=5.0,
                reviews_enotariado=0,
            )
            for d in range(1, 29)
        ]
        mock_fn = AsyncMock(
            return_value=TrendsOut(months=days, granularity="day")
        )
        with patch("app.api.v1.metrics.svc.get_trends", mock_fn):
            resp = await client.get(
                "/api/v1/metrics/trends?granularity=day"
                "&date_from=2026-02-01&date_to=2026-02-28"
            )
        assert resp.status_code == 200
        assert len(resp.json()["months"]) == 28
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["granularity"] == "day"
        assert kwargs["date_from"] == "2026-02-01"
        assert kwargs["date_to"] == "2026-02-28"

    async def test_trends_date_range_default_granularity_is_month(
        self, client: AsyncClient
    ) -> None:
        """``date_from``/``date_to`` without explicit granularity stay monthly."""
        mock_fn = AsyncMock(
            return_value=TrendsOut(months=[], granularity="month")
        )
        with patch("app.api.v1.metrics.svc.get_trends", mock_fn):
            resp = await client.get(
                "/api/v1/metrics/trends"
                "?date_from=2026-01-01&date_to=2026-03-31"
            )
        assert resp.status_code == 200
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["granularity"] == "month"
        assert kwargs["date_from"] == "2026-01-01"
        assert kwargs["date_to"] == "2026-03-31"
        assert resp.json()["granularity"] == "month"

    async def test_trends_invalid_granularity_rejected(
        self, client: AsyncClient
    ) -> None:
        """``granularity`` is validated by the ``Literal`` type."""
        resp = await client.get("/api/v1/metrics/trends?granularity=week")
        # FastAPI validation returns 422 for unknown Literal values.
        assert resp.status_code == 422


class TestCollaboratorMentionsDateRange:
    """``date_from``/``date_to`` on GET /metrics/collaborator-mentions."""

    async def test_collaborator_mentions_without_date_params_unchanged(
        self, client: AsyncClient
    ) -> None:
        """No date params → service receives ``date_from=None``/``date_to=None``."""
        mock_fn = AsyncMock(
            return_value=CollaboratorMentionsOut(collaborators=[])
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get("/api/v1/metrics/collaborator-mentions")
        assert resp.status_code == 200
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["date_from"] is None
        assert kwargs["date_to"] is None
        assert kwargs["months"] == 12

    async def test_collaborator_mentions_date_range_passed_to_service(
        self, client: AsyncClient
    ) -> None:
        """Both date bounds reach the service with the exact values given."""
        mock_fn = AsyncMock(
            return_value=CollaboratorMentionsOut(
                collaborators=[
                    CollaboratorMentionOut(
                        collaborator_id=7,
                        full_name="Ana Ranged",
                        is_active=True,
                        total_mentions=3,
                        avg_rating_mentioned=4.3,
                        monthly=[
                            CollaboratorMonthData(
                                month="2026-02-01",
                                mentions=3,
                                avg_rating=4.3,
                            ),
                        ],
                    ),
                ]
            )
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get(
                "/api/v1/metrics/collaborator-mentions"
                "?date_from=2026-02-01&date_to=2026-02-28"
            )
        assert resp.status_code == 200
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["date_from"] == "2026-02-01"
        assert kwargs["date_to"] == "2026-02-28"
        body = resp.json()
        assert len(body["collaborators"]) == 1
        assert body["collaborators"][0]["total_mentions"] == 3

    async def test_collaborator_mentions_future_range_returns_empty(
        self, client: AsyncClient
    ) -> None:
        """A range well into the future yields an empty collaborators list."""
        mock_fn = AsyncMock(
            return_value=CollaboratorMentionsOut(collaborators=[])
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get(
                "/api/v1/metrics/collaborator-mentions"
                "?date_from=2099-01-01&date_to=2099-12-31"
            )
        assert resp.status_code == 200
        assert resp.json() == {"collaborators": []}
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["date_from"] == "2099-01-01"
        assert kwargs["date_to"] == "2099-12-31"

    async def test_collaborator_mentions_only_date_from_passes_through(
        self, client: AsyncClient
    ) -> None:
        """A single bound (``date_from`` only) still reaches the service."""
        mock_fn = AsyncMock(
            return_value=CollaboratorMentionsOut(collaborators=[])
        )
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get(
                "/api/v1/metrics/collaborator-mentions?date_from=2026-03-01"
            )
        assert resp.status_code == 200
        kwargs = mock_fn.call_args.kwargs
        assert kwargs["date_from"] == "2026-03-01"
        assert kwargs["date_to"] is None


class TestDateRangeValidation:
    """Phase 3.9 SI-3 — malformed ISO dates return 422 instead of 500.

    Prior to the handler-level validator in ``metrics.py``, a bad
    ``date_from``/``date_to`` bubbled up as a ``ValueError`` from
    ``metrics_service._parse_date`` and became an opaque 500. The
    validator now rejects these requests at the boundary with a 422 and a
    message that names the offending parameter.
    """

    async def test_trends_rejects_garbage_date_from(
        self, client: AsyncClient
    ) -> None:
        """``date_from=garbage`` on /trends returns 422, never hits service."""
        mock_fn = AsyncMock()
        with patch("app.api.v1.metrics.svc.get_trends", mock_fn):
            resp = await client.get(
                "/api/v1/metrics/trends?date_from=garbage&granularity=day"
            )
        assert resp.status_code == 422
        assert "Invalid ISO date" in resp.text
        assert "date_from" in resp.text
        mock_fn.assert_not_called()

    async def test_collaborator_mentions_rejects_out_of_range_date_to(
        self, client: AsyncClient
    ) -> None:
        """``date_to=2026-13-40`` on /collaborator-mentions returns 422."""
        mock_fn = AsyncMock()
        with patch(
            "app.api.v1.metrics.svc.get_collaborator_mentions", mock_fn
        ):
            resp = await client.get(
                "/api/v1/metrics/collaborator-mentions?date_to=2026-13-40"
            )
        assert resp.status_code == 422
        assert "Invalid ISO date" in resp.text
        assert "date_to" in resp.text
        mock_fn.assert_not_called()

    async def test_overview_rejects_malformed_date_from(
        self, client: AsyncClient
    ) -> None:
        """``date_from`` on /overview is validated at the same boundary."""
        resp = await client.get(
            "/api/v1/metrics/overview?date_from=not-a-date"
        )
        assert resp.status_code == 422
        assert "Invalid ISO date" in resp.text

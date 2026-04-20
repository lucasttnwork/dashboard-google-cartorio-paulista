"""Tests for workers/app/tasks/analyze_review.py"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from app.tasks.analyze_review import analyze_review, OPENROUTER_URL


@pytest.fixture
def ctx():
    """Base context with mocked pool and http_client."""
    pool = AsyncMock()
    http_client = httpx.AsyncClient()
    return {"db_pool": pool, "http_client": http_client}


@pytest.fixture
def review_row():
    return {"id": 1, "review_id": "rev_001", "comment": "Ótimo atendimento do João!"}


@pytest.fixture
def collaborators_rows():
    return [
        {"id": 10, "full_name": "João", "aliases": json.dumps(["Joãozinho"])},
        {"id": 20, "full_name": "Maria", "aliases": None},
    ]


def _make_pool(review_row, collaborators_rows):
    """Create mock pool that returns review then collaborators."""
    conn_mock = AsyncMock()
    conn_mock.fetchrow = AsyncMock(return_value=review_row)
    conn_mock.fetch = AsyncMock(return_value=collaborators_rows)
    conn_mock.execute = AsyncMock()

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_async_ctx(conn_mock))
    return pool


class _async_ctx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass


@respx.mock
@pytest.mark.asyncio
async def test_analyze_positive_sentiment(review_row, collaborators_rows):
    pool = _make_pool(review_row, collaborators_rows)
    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}

        nlp_response = {
            "sentiment": "positive",
            "mentions": [
                {"name": "João", "sentiment": "positive", "confidence": 0.95, "excerpt": "Ótimo atendimento do João"}
            ],
        }

        respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
        ))

        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            result = await analyze_review(ctx, review_id="rev_001")

    assert result["status"] == "completed"
    assert result["sentiment"] == "positive"
    assert result["mentions"] == 1


@respx.mock
@pytest.mark.asyncio
async def test_analyze_with_mentions_low_confidence(review_row, collaborators_rows):
    """Mentions below threshold are filtered out."""
    pool = _make_pool(review_row, collaborators_rows)
    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}

        nlp_response = {
            "sentiment": "neutral",
            "mentions": [
                {"name": "João", "sentiment": "neutral", "confidence": 0.3, "excerpt": "maybe João"}
            ],
        }

        respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
        ))

        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            result = await analyze_review(ctx, review_id="rev_001")

    assert result["status"] == "completed"
    assert result["mentions"] == 0


@respx.mock
@pytest.mark.asyncio
async def test_analyze_invalid_json_response(review_row, collaborators_rows):
    """Invalid JSON → mark as analysis_failed, no retry."""
    pool = _make_pool(review_row, collaborators_rows)
    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}

        respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
            200,
            json={"choices": [{"message": {"content": "not valid json {"}}]},
        ))

        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            result = await analyze_review(ctx, review_id="rev_001")

    assert result["status"] == "error"
    assert result["reason"] == "invalid_json"


@respx.mock
@pytest.mark.asyncio
async def test_analyze_retryable_429(review_row, collaborators_rows):
    """HTTP 429 → raise for arq retry."""
    pool = _make_pool(review_row, collaborators_rows)
    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}

        respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(429))

        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7

            with pytest.raises(RuntimeError, match="429"):
                await analyze_review(ctx, review_id="rev_001")


@pytest.mark.asyncio
async def test_analyze_no_api_key():
    ctx = {"db_pool": AsyncMock(), "http_client": AsyncMock()}
    with patch("app.tasks.analyze_review.settings") as mock_s:
        mock_s.openrouter_api_key = ""
        result = await analyze_review(ctx, review_id="rev_001")
    assert result["status"] == "skipped"
    assert result["reason"] == "no_api_key"


@pytest.mark.asyncio
async def test_analyze_no_review_text(collaborators_rows):
    """Review with no comment → skip."""
    review_no_text = {"id": 1, "review_id": "rev_002", "comment": None}
    pool = _make_pool(review_no_text, collaborators_rows)
    ctx = {"db_pool": pool, "http_client": AsyncMock()}

    with patch("app.tasks.analyze_review.settings") as mock_s:
        mock_s.openrouter_api_key = "test-key"
        result = await analyze_review(ctx, review_id="rev_002")
    assert result["status"] == "skipped"
    assert result["reason"] == "no_text"

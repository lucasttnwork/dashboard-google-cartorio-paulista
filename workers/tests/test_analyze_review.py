"""Tests for workers/app/tasks/analyze_review.py (batched pipeline)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from app.tasks.analyze_review import (
    analyze_review,
    analyze_reviews_batch,
    OPENROUTER_URL,
)


class _async_ctx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass


def _make_pool(review_rows, collaborators_rows):
    """Pool whose conn.fetch returns reviews then collaborators (then []...)."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(side_effect=[review_rows, collaborators_rows, []])
    conn.execute = AsyncMock()
    pool = MagicMock()
    pool.acquire = MagicMock(side_effect=lambda: _async_ctx(conn))
    return pool, conn


@pytest.fixture
def collaborators_rows():
    return [
        {"id": 10, "full_name": "João", "aliases": json.dumps(["Joãozinho"])},
        {"id": 20, "full_name": "Maria", "aliases": None},
    ]


# ---------------------------------------------------------------------------
# analyze_reviews_batch
# ---------------------------------------------------------------------------


@respx.mock
@pytest.mark.asyncio
async def test_batch_happy_path(collaborators_rows):
    review_rows = [
        {"review_id": "rev_001", "comment": "Ótimo atendimento do João!"},
        {"review_id": "rev_002", "comment": "Maria foi péssima no atendimento."},
    ]
    pool, conn = _make_pool(review_rows, collaborators_rows)

    nlp_response = {
        "results": [
            {
                "key": "R1",
                "sentiment": "positive",
                "mentions": [{
                    "name": "João", "sentiment": "positive",
                    "confidence": 0.95, "excerpt": "Ótimo atendimento do João",
                }],
            },
            {
                "key": "R2",
                "sentiment": "negative",
                "mentions": [{
                    "name": "Maria", "sentiment": "negative",
                    "confidence": 0.9, "excerpt": "Maria foi péssima",
                }],
            },
        ]
    }
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_reviews_batch(
                ctx, review_ids=["rev_001", "rev_002"]
            )

    assert result["status"] == "completed"
    assert result["processed"] == 2
    assert result["mentions"] == 2


@respx.mock
@pytest.mark.asyncio
async def test_batch_low_confidence_filtered(collaborators_rows):
    review_rows = [{"review_id": "rev_001", "comment": "talvez João"}]
    pool, _ = _make_pool(review_rows, collaborators_rows)

    nlp_response = {
        "results": [{
            "key": "R1",
            "sentiment": "neutral",
            "mentions": [{
                "name": "João", "sentiment": "neutral",
                "confidence": 0.3, "excerpt": "talvez João",
            }],
        }]
    }
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_reviews_batch(ctx, review_ids=["rev_001"])

    assert result["status"] == "completed"
    assert result["processed"] == 1
    assert result["mentions"] == 0


@respx.mock
@pytest.mark.asyncio
async def test_batch_alias_resolves_to_canonical(collaborators_rows):
    review_rows = [{"review_id": "rev_001", "comment": "Joãozinho foi ótimo"}]
    pool, conn = _make_pool(review_rows, collaborators_rows)

    nlp_response = {
        "results": [{
            "key": "R1",
            "sentiment": "positive",
            "mentions": [{
                "name": "Joãozinho", "sentiment": "positive",
                "confidence": 0.9, "excerpt": "Joãozinho foi ótimo",
            }],
        }]
    }
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_reviews_batch(ctx, review_ids=["rev_001"])

    assert result["status"] == "completed"
    assert result["mentions"] == 1
    # verify insert used collaborator_id=10 (João)
    insert_calls = [c for c in conn.execute.call_args_list
                    if "INSERT INTO review_collaborators" in str(c)]
    assert insert_calls, "expected an INSERT into review_collaborators"
    assert 10 in insert_calls[0].args


@respx.mock
@pytest.mark.asyncio
async def test_batch_invalid_json(collaborators_rows):
    review_rows = [{"review_id": "rev_001", "comment": "hello"}]
    pool, _ = _make_pool(review_rows, collaborators_rows)

    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": "not valid json {"}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_reviews_batch(ctx, review_ids=["rev_001"])

    assert result["status"] == "error"
    assert result["reason"] == "invalid_json"


@respx.mock
@pytest.mark.asyncio
async def test_batch_retryable_429(collaborators_rows):
    review_rows = [{"review_id": "rev_001", "comment": "hello"}]
    pool, _ = _make_pool(review_rows, collaborators_rows)

    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(429))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            with pytest.raises(RuntimeError, match="429"):
                await analyze_reviews_batch(ctx, review_ids=["rev_001"])


@pytest.mark.asyncio
async def test_batch_empty_list():
    ctx = {"db_pool": AsyncMock(), "http_client": AsyncMock()}
    with patch("app.tasks.analyze_review.settings") as mock_s:
        mock_s.openrouter_api_key = "test-key"
        result = await analyze_reviews_batch(ctx, review_ids=[])
    assert result["status"] == "skipped"
    assert result["reason"] == "empty_batch"


@pytest.mark.asyncio
async def test_batch_no_api_key():
    ctx = {"db_pool": AsyncMock(), "http_client": AsyncMock()}
    with patch("app.tasks.analyze_review.settings") as mock_s:
        mock_s.openrouter_api_key = ""
        mock_s.nlp_batch_size = 10
        result = await analyze_reviews_batch(ctx, review_ids=["rev_001"])
    assert result["status"] == "skipped"
    assert result["reason"] == "no_api_key"


@pytest.mark.asyncio
async def test_batch_all_reviews_have_no_text(collaborators_rows):
    review_rows = [
        {"review_id": "rev_001", "comment": None},
        {"review_id": "rev_002", "comment": ""},
    ]
    pool, _ = _make_pool(review_rows, collaborators_rows)

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_reviews_batch(
                ctx, review_ids=["rev_001", "rev_002"]
            )
    assert result["status"] == "skipped"
    assert result["reason"] == "no_text"
    assert result["skipped"] == 2


@respx.mock
@pytest.mark.asyncio
async def test_batch_caps_at_nlp_batch_size(collaborators_rows):
    """Only the first nlp_batch_size ids reach the DB fetch."""
    review_rows = [{"review_id": f"rev_{i}", "comment": f"texto {i}"}
                   for i in range(2)]
    pool, conn = _make_pool(review_rows, collaborators_rows)

    nlp_response = {"results": [
        {"key": "R1", "sentiment": "neutral", "mentions": []},
        {"key": "R2", "sentiment": "neutral", "mentions": []},
    ]}
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 2  # cap
            result = await analyze_reviews_batch(
                ctx,
                review_ids=["rev_0", "rev_1", "rev_2", "rev_3", "rev_4"],
            )

    assert result["status"] == "completed"
    assert result["processed"] == 2
    # the first fetch call received only the first 2 ids
    first_fetch_call = conn.fetch.call_args_list[0]
    passed_ids = first_fetch_call.args[1]
    assert passed_ids == ["rev_0", "rev_1"]


@respx.mock
@pytest.mark.asyncio
async def test_batch_missing_result_key_marks_failed(collaborators_rows):
    """If LLM skips a key, that review is marked as failed."""
    review_rows = [
        {"review_id": "rev_001", "comment": "A"},
        {"review_id": "rev_002", "comment": "B"},
    ]
    pool, conn = _make_pool(review_rows, collaborators_rows)

    nlp_response = {"results": [
        {"key": "R1", "sentiment": "neutral", "mentions": []},
        # R2 missing!
    ]}
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_reviews_batch(
                ctx, review_ids=["rev_001", "rev_002"]
            )

    assert result["status"] == "completed"
    assert result["processed"] == 1
    assert result["missing"] == 1
    # an analysis_failed update was issued
    failed_updates = [c for c in conn.execute.call_args_list
                      if "analysis_failed" in str(c)]
    assert failed_updates


# ---------------------------------------------------------------------------
# analyze_review (single-review wrapper → delegates to batch)
# ---------------------------------------------------------------------------


@respx.mock
@pytest.mark.asyncio
async def test_single_wrapper_delegates(collaborators_rows):
    review_rows = [{"review_id": "rev_001", "comment": "Top, João!"}]
    pool, _ = _make_pool(review_rows, collaborators_rows)

    nlp_response = {"results": [{
        "key": "R1",
        "sentiment": "positive",
        "mentions": [{
            "name": "João", "sentiment": "positive",
            "confidence": 0.95, "excerpt": "Top, João!",
        }],
    }]}
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(nlp_response)}}]},
    ))

    async with httpx.AsyncClient() as http_client:
        ctx = {"db_pool": pool, "http_client": http_client}
        with patch("app.tasks.analyze_review.settings") as mock_s:
            mock_s.openrouter_api_key = "test-key"
            mock_s.nlp_confidence_threshold = 0.7
            mock_s.nlp_batch_size = 10
            result = await analyze_review(ctx, review_id="rev_001")

    assert result["status"] == "completed"
    assert result["processed"] == 1
    assert result["mentions"] == 1


@pytest.mark.asyncio
async def test_single_wrapper_no_api_key():
    ctx = {"db_pool": AsyncMock(), "http_client": AsyncMock()}
    with patch("app.tasks.analyze_review.settings") as mock_s:
        mock_s.openrouter_api_key = ""
        mock_s.nlp_batch_size = 10
        result = await analyze_review(ctx, review_id="rev_001")
    assert result["status"] == "skipped"
    assert result["reason"] == "no_api_key"

"""Merge integration tests for /api/v1/collaborators/merge (Phase 2).

Validates mention transfer, alias merging, source deactivation, and
error cases (self-merge, non-existent ids).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create(client: AsyncClient, name: str, **kw) -> dict:
    r = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": name, **kw},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _add_mention(
    session: AsyncSession,
    review_id: str,
    collaborator_id: int,
    *,
    match_score: float = 0.9,
) -> None:
    """Insert a review_collaborators row directly."""
    await session.execute(
        text(
            "INSERT INTO review_collaborators (review_id, collaborator_id, mention_snippet, match_score) "
            "VALUES (:rid, :cid, :snip, :score)"
        ),
        {
            "rid": review_id,
            "cid": collaborator_id,
            "snip": f"mention in {review_id}",
            "score": match_score,
        },
    )
    await session.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_merge_transfers_mentions(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    source = await _create(client, "Source Collab")
    target = await _create(client, "Target Collab")

    # Add mentions to source
    await _add_mention(db_session, "review-1", source["id"])
    await _add_mention(db_session, "review-2", source["id"])

    resp = await client.post(
        "/api/v1/collaborators/merge",
        json={"source_id": source["id"], "target_id": target["id"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mentions_transferred"] == 2
    assert body["target_id"] == target["id"]
    assert body["source_deactivated"] is True


@pytest.mark.asyncio
async def test_merge_self_returns_400(client: AsyncClient) -> None:
    collab = await _create(client, "Self Merge")
    resp = await client.post(
        "/api/v1/collaborators/merge",
        json={"source_id": collab["id"], "target_id": collab["id"]},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "cannot_merge_self"


@pytest.mark.asyncio
async def test_merge_nonexistent_returns_404(client: AsyncClient) -> None:
    collab = await _create(client, "Real Collab")
    resp = await client.post(
        "/api/v1/collaborators/merge",
        json={"source_id": 99999, "target_id": collab["id"]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_deactivates_source(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    source = await _create(client, "Deact Source")
    target = await _create(client, "Keep Target")

    resp = await client.post(
        "/api/v1/collaborators/merge",
        json={"source_id": source["id"], "target_id": target["id"]},
    )
    assert resp.status_code == 200

    # Verify source is now inactive (fetch with include_inactive)
    all_resp = await client.get("/api/v1/collaborators/?include_inactive=true")
    items = {it["id"]: it for it in all_resp.json()["items"]}
    assert items[source["id"]]["is_active"] is False
    assert items[target["id"]]["is_active"] is True


@pytest.mark.asyncio
async def test_merge_adds_aliases(client: AsyncClient) -> None:
    source = await _create(client, "Alias Source", aliases=["OldAlias"])
    target = await _create(client, "Alias Target", aliases=["ExistingAlias"])

    resp = await client.post(
        "/api/v1/collaborators/merge",
        json={"source_id": source["id"], "target_id": target["id"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    # source.full_name and source.aliases should have been added to target
    assert "Alias Source" in body["aliases_added"]

    # Confirm the target now carries the merged aliases
    target_resp = await client.get(f"/api/v1/collaborators/{target['id']}")
    assert target_resp.status_code == 200
    target_aliases = target_resp.json()["aliases"]
    assert "Alias Source" in target_aliases
    assert "OldAlias" in target_aliases
    assert "ExistingAlias" in target_aliases

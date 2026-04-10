"""CRUD integration tests for /api/v1/collaborators/* (Phase 2).

Covers listing, creation, update, deactivation, and reactivation.
All external deps (auth, DB) are overridden via conftest fixtures.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_collaborators_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/collaborators/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["page"] == 1


@pytest.mark.asyncio
async def test_list_collaborators_with_data(client: AsyncClient) -> None:
    # Seed two collaborators
    await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Alice Silva"},
    )
    await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Bruno Santos"},
    )

    resp = await client.get("/api/v1/collaborators/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    names = {item["full_name"] for item in body["items"]}
    assert names == {"Alice Silva", "Bruno Santos"}


@pytest.mark.asyncio
async def test_list_excludes_inactive_by_default(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Active User"},
    )
    assert r.status_code == 201
    cid = r.json()["id"]

    await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Inactive User"},
    )
    # Deactivate the second one
    r2 = await client.get("/api/v1/collaborators/?include_inactive=true")
    inactive_id = [
        it for it in r2.json()["items"] if it["full_name"] == "Inactive User"
    ][0]["id"]
    await client.delete(f"/api/v1/collaborators/{inactive_id}")

    resp = await client.get("/api/v1/collaborators/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["full_name"] == "Active User"


@pytest.mark.asyncio
async def test_list_includes_inactive_when_requested(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Visible"},
    )
    r = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Hidden"},
    )
    hidden_id = r.json()["id"]
    await client.delete(f"/api/v1/collaborators/{hidden_id}")

    resp = await client.get("/api/v1/collaborators/?include_inactive=true")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    names = {it["full_name"] for it in body["items"]}
    assert "Hidden" in names
    assert "Visible" in names


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_collaborator(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/collaborators/",
        json={
            "full_name": "Maria Oliveira",
            "aliases": ["Mariazinha"],
            "department": "Registro Civil",
            "position": "Escrevente",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["full_name"] == "Maria Oliveira"
    assert body["aliases"] == ["Mariazinha"]
    assert body["department"] == "Registro Civil"
    assert body["position"] == "Escrevente"
    assert body["is_active"] is True
    assert body["mention_count"] == 0
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_create_duplicate_name_409(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Duplicate Name"},
    )
    resp = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Duplicate Name"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "duplicate_full_name"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_collaborator(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "Original Name", "department": "Old Dept"},
    )
    cid = r.json()["id"]

    resp = await client.patch(
        f"/api/v1/collaborators/{cid}",
        json={"department": "New Dept", "position": "Manager"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["department"] == "New Dept"
    assert body["position"] == "Manager"
    assert body["full_name"] == "Original Name"


# ---------------------------------------------------------------------------
# Deactivate / Reactivate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deactivate_collaborator(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "To Deactivate"},
    )
    cid = r.json()["id"]

    resp = await client.delete(f"/api/v1/collaborators/{cid}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is False


@pytest.mark.asyncio
async def test_reactivate_collaborator(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/collaborators/",
        json={"full_name": "To Reactivate"},
    )
    cid = r.json()["id"]

    # Deactivate first
    await client.delete(f"/api/v1/collaborators/{cid}")

    resp = await client.post(f"/api/v1/collaborators/{cid}/reactivate")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is True

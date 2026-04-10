"""CSV import/export integration tests for /api/v1/collaborators (Phase 2).

Covers export, import (create + update), and error handling for
missing required fields.
"""

from __future__ import annotations

import io

import pytest
from httpx import AsyncClient


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


def _csv_bytes(content: str) -> bytes:
    return content.encode("utf-8")


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_csv(client: AsyncClient) -> None:
    await _create(client, "Export Alice", department="Civil", position="Clerk")
    await _create(client, "Export Bruno", department="Notas")

    resp = await client.get("/api/v1/collaborators/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")

    lines = resp.text.strip().splitlines()
    assert len(lines) == 3  # header + 2 rows
    header = lines[0]
    assert "full_name" in header
    assert "department" in header

    # Verify both names appear in the body
    body_text = "\n".join(lines[1:])
    assert "Export Alice" in body_text
    assert "Export Bruno" in body_text


# ---------------------------------------------------------------------------
# Import - create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_csv_creates(client: AsyncClient) -> None:
    csv_content = (
        "full_name,aliases,department,position\n"
        "Imported Alice,,Registro Civil,Escrevente\n"
        "Imported Bruno,Bruninho; B. Santos,Notas,Tabeliao\n"
    )

    resp = await client.post(
        "/api/v1/collaborators/import",
        files={"file": ("import.csv", _csv_bytes(csv_content), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 2
    assert body["updated"] == 0
    assert body["errors"] == []

    # Verify the created collaborators are retrievable
    list_resp = await client.get("/api/v1/collaborators/")
    names = {it["full_name"] for it in list_resp.json()["items"]}
    assert "Imported Alice" in names
    assert "Imported Bruno" in names


# ---------------------------------------------------------------------------
# Import - missing name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_csv_missing_name(client: AsyncClient) -> None:
    csv_content = (
        "full_name,department\n"
        ",BadDept\n"
        "Valid Name,GoodDept\n"
    )

    resp = await client.post(
        "/api/v1/collaborators/import",
        files={"file": ("import.csv", _csv_bytes(csv_content), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1
    assert len(body["errors"]) == 1
    assert body["errors"][0]["row"] == 2
    assert "full_name" in body["errors"][0]["error"].lower()


# ---------------------------------------------------------------------------
# Import - updates existing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_csv_updates_existing(client: AsyncClient) -> None:
    # Pre-create a collaborator
    await _create(client, "PreExisting", department="Old Dept")

    csv_content = (
        "full_name,department,position\n"
        "PreExisting,New Dept,Senior\n"
    )

    resp = await client.post(
        "/api/v1/collaborators/import",
        files={"file": ("import.csv", _csv_bytes(csv_content), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["updated"] == 1
    assert body["created"] == 0

    # Verify the update took effect
    list_resp = await client.get("/api/v1/collaborators/")
    item = [
        it for it in list_resp.json()["items"]
        if it["full_name"] == "PreExisting"
    ][0]
    assert item["department"] == "New Dept"
    assert item["position"] == "Senior"

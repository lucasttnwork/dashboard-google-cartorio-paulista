"""Audit log integration tests for collaborator mutations (Phase 2).

Verifies that create, update, and merge operations write the expected
audit_log rows to the database.
"""

from __future__ import annotations

import json

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


async def _get_audit_rows(session: AsyncSession) -> list[dict]:
    """Fetch all audit_log rows as dicts."""
    result = await session.execute(
        text("SELECT id, entity_type, entity_id, action, actor_email, diff FROM audit_log ORDER BY id")
    )
    rows = result.fetchall()
    return [
        {
            "id": r[0],
            "entity_type": r[1],
            "entity_id": r[2],
            "action": r[3],
            "actor_email": r[4],
            "diff": json.loads(r[5]) if isinstance(r[5], str) else r[5],
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_writes_audit_log(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    collab = await _create(client, "Audit Create Test", department="Civil")

    logs = await _get_audit_rows(db_session)
    create_logs = [l for l in logs if l["action"] == "create"]
    assert len(create_logs) >= 1

    entry = create_logs[-1]
    assert entry["entity_type"] == "collaborator"
    assert entry["entity_id"] == collab["id"]
    assert entry["actor_email"] == "admin@cartorio.test"
    assert entry["diff"]["full_name"] == "Audit Create Test"


@pytest.mark.asyncio
async def test_update_writes_audit_log(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    collab = await _create(client, "Audit Update Test")

    await client.patch(
        f"/api/v1/collaborators/{collab['id']}",
        json={"department": "New Dept"},
    )

    logs = await _get_audit_rows(db_session)
    update_logs = [l for l in logs if l["action"] == "update"]
    assert len(update_logs) >= 1

    entry = update_logs[-1]
    assert entry["entity_type"] == "collaborator"
    assert entry["entity_id"] == collab["id"]
    assert "after" in entry["diff"]
    assert entry["diff"]["after"]["department"] == "New Dept"


@pytest.mark.asyncio
async def test_merge_writes_audit_log(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    source = await _create(client, "Audit Merge Source")
    target = await _create(client, "Audit Merge Target")

    resp = await client.post(
        "/api/v1/collaborators/merge",
        json={"source_id": source["id"], "target_id": target["id"]},
    )
    assert resp.status_code == 200

    logs = await _get_audit_rows(db_session)
    merge_logs = [l for l in logs if l["action"] == "merge"]
    assert len(merge_logs) >= 1

    entry = merge_logs[-1]
    assert entry["entity_type"] == "collaborator"
    assert entry["entity_id"] == target["id"]
    assert entry["diff"]["source_id"] == source["id"]
    assert entry["diff"]["target_id"] == target["id"]
    assert entry["diff"]["source_name"] == "Audit Merge Source"

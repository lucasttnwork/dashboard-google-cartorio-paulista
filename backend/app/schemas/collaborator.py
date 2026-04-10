"""Pydantic schemas for /api/v1/collaborators/* endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CollaboratorCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list)
    department: str | None = "E-notariado"
    position: str | None = None


class CollaboratorUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    aliases: list[str] | None = None
    department: str | None = None
    position: str | None = None
    is_active: bool | None = None
    user_id: str | None = None  # UUID as string, nullable


class CollaboratorOut(BaseModel):
    id: int
    full_name: str
    aliases: list[str]
    department: str | None
    position: str | None
    is_active: bool
    user_id: str | None = None
    mention_count: int = 0
    created_at: datetime
    updated_at: datetime


class CollaboratorDetail(CollaboratorOut):
    """Extended response for single-collaborator GET."""
    pass


class CollaboratorListResponse(BaseModel):
    items: list[CollaboratorOut]
    total: int
    page: int
    page_size: int


class MergeRequest(BaseModel):
    source_id: int
    target_id: int


class MergeResponse(BaseModel):
    target_id: int
    mentions_transferred: int
    aliases_added: list[str]
    source_deactivated: bool


class CSVImportRow(BaseModel):
    row: int
    error: str


class CSVImportResponse(BaseModel):
    created: int
    updated: int
    errors: list[CSVImportRow]


class AuditLogOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    action: str
    actor_email: str
    diff: dict
    created_at: datetime

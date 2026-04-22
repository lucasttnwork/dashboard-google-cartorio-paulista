"""Pydantic schemas for /api/v1/admin/users/* endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "manager", "viewer"]


class AdminUserOut(BaseModel):
    id: UUID
    email: str
    role: Role
    is_active: bool
    collaborator_id: int | None = None
    collaborator_name: str | None = None
    created_at: datetime | None = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserOut]


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role
    collaborator_id: int | None = None


class AdminUserCreateResponse(BaseModel):
    id: UUID
    email: str
    role: Role
    is_active: bool
    collaborator_id: int | None = None
    temp_password: str


class AdminUserUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None
    collaborator_id: int | None = Field(default=None, description="set null to unlink")
    clear_collaborator: bool = False

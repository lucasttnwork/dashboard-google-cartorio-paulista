"""Pydantic schemas for /api/v1/auth/* endpoints.

Request and response models used by the auth router (T1.W2.6).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    access_token: str = Field(min_length=1)
    password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: UUID
    email: str
    role: str
    created_at: datetime


class LoginResponse(BaseModel):
    user: UserOut
    expires_at: int | None = None


class MeResponse(BaseModel):
    id: UUID
    email: str
    role: str
    created_at: datetime
    app_metadata: dict[str, Any] = Field(default_factory=dict)
    must_change_password: bool = False

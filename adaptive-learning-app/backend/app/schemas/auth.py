"""
app/schemas/auth.py — Pydantic request and response schemas for authentication.

These models validate incoming request bodies and shape outgoing responses.
They are completely separate from the SQLAlchemy models in models.py.
"""

import re
from pydantic import BaseModel, EmailStr, field_validator


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters.")
        if len(v) > 80:
            raise ValueError("Username must be 80 characters or fewer.")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError(
                "Username may only contain letters, numbers, and underscores."
            )
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number.")
        return v


class RegisterResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    message: str


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    message: str
    username: str
    role: str


# ---------------------------------------------------------------------------
# Current user (returned by /auth/me)
# ---------------------------------------------------------------------------
class UserMeResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------
class LogoutResponse(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Account recovery
# ---------------------------------------------------------------------------
class RecoverRequest(BaseModel):
    email: EmailStr


class RecoverResponse(BaseModel):
    message: str

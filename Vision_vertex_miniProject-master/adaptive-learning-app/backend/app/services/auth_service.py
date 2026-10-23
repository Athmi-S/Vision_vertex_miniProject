"""
app/services/auth_service.py — Password hashing and JWT utilities.

This module handles:
  - Bcrypt password hashing and verification via passlib
  - JWT access token creation and decoding via python-jose
  - OTP generation for account recovery

Secrets are read from environment variables — never hardcoded here.
"""

import os
import random
import string
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

# ---------------------------------------------------------------------------
# Password hashing
# bcrypt is the industry-standard algorithm for password storage.
# deprecated="auto" automatically upgrades old hashes on next login.
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the given plaintext password."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches hashed, False otherwise."""
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT configuration — loaded from environment variables
# ---------------------------------------------------------------------------
SECRET_KEY: str = os.getenv("SECRET_KEY", "")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
)

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set. "
        "Copy .env.example to .env and set a strong SECRET_KEY before starting."
    )


def create_access_token(data: dict) -> str:
    """
    Create a signed JWT access token.

    Args:
        data: Dict of claims to encode. Must include 'sub' (subject = user id).

    Returns:
        Signed JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT access token.

    Returns:
        The decoded payload dict.

    Raises:
        JWTError: if the token is invalid, expired, or tampered with.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# Account recovery OTP
# ---------------------------------------------------------------------------
def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP string of the given length."""
    return "".join(random.choices(string.digits, k=length))

"""
app/dependencies.py — Reusable FastAPI dependencies for authentication.

get_current_learner() reads the JWT from the HttpOnly cookie set at login
and returns the authenticated User row. Any route that depends on this will
automatically return 401 if the cookie is missing or the token is invalid.

get_current_admin() extends this to also require role == 'admin'.
"""

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.auth_service import decode_access_token


def get_current_learner(
    vision_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency: extract and verify the JWT from the 'vision_token' HttpOnly
    cookie. Returns the User ORM object if valid.

    Raises HTTP 401 if:
      - The cookie is absent
      - The token is expired or invalid
      - The user no longer exists or is inactive
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please log in.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if vision_token is None:
        raise credentials_error

    try:
        payload = decode_access_token(vision_token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except JWTError:
        raise credentials_error

    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise credentials_error

    return user


def get_current_admin(
    current_user: User = Depends(get_current_learner),
) -> User:
    """
    Dependency: like get_current_learner but also requires role == 'admin'.
    Returns HTTP 403 if the authenticated user is not an admin.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )
    return current_user

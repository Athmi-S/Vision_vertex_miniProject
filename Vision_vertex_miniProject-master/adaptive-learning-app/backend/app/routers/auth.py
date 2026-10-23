"""
app/routers/auth.py — Authentication endpoints.

POST /auth/register   — create a new learner account
POST /auth/login      — verify credentials, set HttpOnly JWT cookie
POST /auth/logout     — clear the JWT cookie
POST /auth/recover    — request a password-reset OTP (dev: logged to console)
GET  /auth/me         — return the currently authenticated user's profile
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_learner
from app.models import LearnerProfile, User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RecoverRequest,
    RecoverResponse,
    RegisterRequest,
    RegisterResponse,
    UserMeResponse,
)
from app.services.auth_service import (
    create_access_token,
    generate_otp,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["authentication"])

# Determine whether to set Secure flag on cookies.
# In development (HTTP) we do NOT set Secure — browsers reject Secure cookies
# on plain HTTP. In production (HTTPS) Secure must be True.
_IS_PROD: bool = os.getenv("APP_ENV", "development") == "production"


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------
@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new learner account",
)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    """
    Create a new learner account.

    - Validates username, email, and password strength.
    - Hashes the password with bcrypt before storing.
    - Creates a linked LearnerProfile row.
    - Does NOT allow public registration to create admin accounts.
    - Returns 409 if the email or username is already taken.
    """
    # Check for duplicate email
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )
    # Check for duplicate username
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken. Please choose another.",
        )

    # Create user — role is always 'learner' from this endpoint
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role="learner",
        is_active=True,
    )
    db.add(user)
    db.flush()  # get user.id before committing

    # Create a linked learner profile
    profile = LearnerProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    db.refresh(user)

    return RegisterResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        message="Account created successfully. You can now log in.",
    )


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------
@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Log in and receive an authentication cookie",
)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """
    Verify credentials and set a signed JWT in an HttpOnly cookie.

    - Returns 401 for both wrong email and wrong password (same message)
      to prevent email enumeration.
    - Cookie is HttpOnly (not accessible to JavaScript).
    - Cookie is SameSite=Lax to prevent CSRF on cross-site navigations.
    - Cookie is Secure only in production (HTTPS).
    """
    # Fetch user by email or username — same error message whether identifier or password is wrong
    user = (
        db.query(User)
        .filter((User.email == body.email) | (User.username == body.email))
        .first()
    )

    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
    )

    if user is None:
        raise _invalid
    if not verify_password(body.password, user.password_hash):
        raise _invalid
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})

    response.set_cookie(
        key="vision_token",
        value=token,
        httponly=True,           # Not accessible to JavaScript
        samesite="lax",          # Prevents CSRF on cross-site POST
        secure=_IS_PROD,         # True only in production (HTTPS)
        max_age=60 * int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
        path="/",
    )

    return LoginResponse(
        message="Login successful.",
        username=user.username,
        role=user.role,
    )


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------
@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Log out and clear the authentication cookie",
)
def logout(response: Response) -> LogoutResponse:
    """
    Clear the JWT cookie. No token validation needed —
    if there is no valid cookie, clearing it is a no-op.
    """
    response.delete_cookie(key="vision_token", path="/")
    return LogoutResponse(message="Logged out successfully.")


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
@router.get(
    "/me",
    response_model=UserMeResponse,
    summary="Return the currently authenticated user",
)
def me(current_user: User = Depends(get_current_learner)) -> UserMeResponse:
    """
    Returns the profile of the currently authenticated user.
    Requires a valid 'vision_token' cookie.
    The frontend calls this on page load to restore session state.
    """
    return UserMeResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
    )


# ---------------------------------------------------------------------------
# POST /auth/recover
# ---------------------------------------------------------------------------
@router.post(
    "/recover",
    response_model=RecoverResponse,
    summary="Request a password-reset OTP",
)
def recover(body: RecoverRequest, db: Session = Depends(get_db)) -> RecoverResponse:
    """
    Request a password reset.

    IMPORTANT — Development placeholder:
    - Always returns the same success message whether the email exists or not.
      This prevents attackers from discovering which emails are registered.
    - In development mode the OTP is printed to the server console.
    - Real email delivery (SMTP) is NOT implemented yet (Stage 3+).
    - The OTP is not persisted — a full implementation would store it with an
      expiry in the database.
    """
    # Look up user silently — do not reveal existence
    user = db.query(User).filter(User.email == body.email).first()

    if user and user.is_active:
        otp = generate_otp()
        # DEV ONLY — log OTP to console instead of sending email
        print(
            f"\n[DEV] Password reset OTP for {body.email}: {otp} "
            f"(valid for 15 minutes — email delivery not yet implemented)\n"
        )

    # Always return the same message regardless of whether the email exists
    return RecoverResponse(
        message=(
            "If an account with that email address exists, a reset code has been "
            "sent. (Development mode: check the server console for the OTP.)"
        )
    )

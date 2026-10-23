"""
app/routers/profile.py — Learner profile endpoints.

GET /profile  — return the authenticated learner's profile
PUT /profile  — update learning_mode and/or language_pref

Design notes:
  - Both endpoints require an authenticated learner (HttpOnly JWT cookie).
  - The learner's identity is ALWAYS taken from get_current_learner(); the
    request body never carries a user_id or learner_id.
  - A newly registered learner has learning_mode=None until they choose one.
    PUT accepts None for learning_mode to allow clearing it.
  - If the profile row is unexpectedly missing (defensive case), GET returns
    the default profile values rather than crashing or leaking another user's
    data.  PUT creates the missing row transparently.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_learner
from app.models import LearnerProfile, User
from app.schemas.profile import ProfileResponse, UpdateProfileRequest

router = APIRouter(prefix="/profile", tags=["profile"])


# ---------------------------------------------------------------------------
# Shared helper: build ProfileResponse from User + LearnerProfile
# ---------------------------------------------------------------------------

def _build_response(user: User, profile: LearnerProfile) -> ProfileResponse:
    """Assemble the ProfileResponse from ORM objects."""
    return ProfileResponse(
        user_id=user.id,
        username=user.username,
        email=user.email,
        learning_mode=profile.learning_mode,
        language_pref=profile.language_pref,
    )


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------
@router.get(
    "",
    response_model=ProfileResponse,
    summary="Get the authenticated learner's profile",
)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learner),
) -> ProfileResponse:
    """
    Return the profile of the currently authenticated learner.

    Combines fields from the users table (id, username, email) with the
    learner_profiles table (learning_mode, language_pref).

    Returns 404 only if the profile row is genuinely absent (should not happen
    after registration, but handled defensively to avoid an unhandled 500).
    The 404 message is generic — it never references another user.
    """
    profile = (
        db.query(LearnerProfile)
        .filter(LearnerProfile.user_id == current_user.id)
        .first()
    )

    if profile is None:
        # Defensive: registration should always create this row.
        # If it is missing, create it now rather than returning a 500.
        profile = LearnerProfile(user_id=current_user.id, language_pref="en")
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return _build_response(current_user, profile)


# ---------------------------------------------------------------------------
# PUT /profile
# ---------------------------------------------------------------------------
@router.put(
    "",
    response_model=ProfileResponse,
    summary="Update the authenticated learner's learning mode and/or language",
)
def update_profile(
    body: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learner),
) -> ProfileResponse:
    """
    Update learning_mode and/or language_pref for the current learner.

    Rules:
      - learning_mode  : required field; must be "academic", "competitive",
                         "topic", or null (null clears the mode).
      - language_pref  : optional; if omitted (None), the existing value is
                         kept.  If supplied, must be a supported BCP-47 code.
      - The learner's user_id is taken from the authenticated cookie only —
        it is NEVER accepted from the request body.
      - If the profile row is missing, it is created transparently.

    Returns the full updated profile.
    """
    profile = (
        db.query(LearnerProfile)
        .filter(LearnerProfile.user_id == current_user.id)
        .first()
    )

    if profile is None:
        # Defensive: create the missing row so the update can proceed.
        profile = LearnerProfile(user_id=current_user.id, language_pref="en")
        db.add(profile)
        db.flush()

    # Apply learning_mode (always present in body — may be None to clear it)
    profile.learning_mode = body.learning_mode

    # Apply language_pref only if the client supplied a value
    if body.language_pref is not None:
        profile.language_pref = body.language_pref

    db.commit()
    db.refresh(profile)

    return _build_response(current_user, profile)

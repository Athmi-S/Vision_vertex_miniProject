"""
app/schemas/profile.py — Pydantic schemas for the learner profile endpoints.

GET  /profile  → ProfileResponse
PUT  /profile  → UpdateProfileRequest (body)  →  ProfileResponse

Design decisions:
  - learning_mode is Optional[str] because a newly registered learner has not
    yet chosen a mode.  The PUT endpoint accepts None to clear the mode, but
    the three allowed string values are enforced when a string is supplied.
  - language_pref is a non-empty BCP-47 tag of 2–10 characters.  We validate
    against a small whitelist of languages the application currently supports
    (EN, HI, KN, TA).  The validator is easy to extend for Stage 6.
  - No user_id or learner_id field appears in the request body — the router
    always reads the identity from the authenticated cookie.
"""

from typing import Literal

from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Allowed values
# ---------------------------------------------------------------------------

# The three learning modes the application supports.
# Member 3's adaptive engine uses this field to choose a teaching strategy.
ALLOWED_MODES: frozenset[str] = frozenset({"academic", "competitive", "topic"})

# Languages with content in Stage 1 seed data (English only) plus languages
# targeted for Stage 6 multilingual expansion.
ALLOWED_LANGUAGES: frozenset[str] = frozenset({"en", "hi", "kn", "ta"})


# ---------------------------------------------------------------------------
# Response schema  (used for both GET and PUT responses)
# ---------------------------------------------------------------------------
class ProfileResponse(BaseModel):
    """
    Full profile returned to the authenticated learner.

    Combines the Users table fields (id, username, email) with the
    LearnerProfile table fields (learning_mode, language_pref).
    """
    user_id: int
    username: str
    email: str
    learning_mode: str | None   # None = learner has not selected a mode yet
    language_pref: str


# ---------------------------------------------------------------------------
# Update request schema
# ---------------------------------------------------------------------------
class UpdateProfileRequest(BaseModel):
    """
    Fields the learner may change via PUT /profile.

    Both fields are optional — the client may send either one or both.
    Omitting a field leaves that field unchanged.
    """
    learning_mode: str | None = ...   # required but nullable (None clears mode)
    language_pref: str | None = None  # optional — omit to leave unchanged

    @field_validator("learning_mode")
    @classmethod
    def mode_allowed(cls, v: str | None) -> str | None:
        """
        Accept None (clears the mode) or one of the three allowed strings.
        Rejects any other value with a clear error message.
        """
        if v is None:
            return v
        v = v.strip().lower()
        if v not in ALLOWED_MODES:
            raise ValueError(
                f"learning_mode must be one of {sorted(ALLOWED_MODES)} or null. "
                f"Got: {v!r}"
            )
        return v

    @field_validator("language_pref")
    @classmethod
    def lang_allowed(cls, v: str | None) -> str | None:
        """
        Accept None (means 'do not change') or a supported language code.
        Codes are normalised to lowercase before the whitelist check.
        """
        if v is None:
            return v
        v = v.strip().lower()
        if not v:
            raise ValueError("language_pref must not be an empty string.")
        if len(v) > 10:
            raise ValueError("language_pref must be 10 characters or fewer.")
        if v not in ALLOWED_LANGUAGES:
            raise ValueError(
                f"language_pref must be one of {sorted(ALLOWED_LANGUAGES)}. "
                f"Got: {v!r}"
            )
        return v

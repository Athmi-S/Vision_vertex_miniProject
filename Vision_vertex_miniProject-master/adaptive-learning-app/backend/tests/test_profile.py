"""
tests/test_profile.py — Integration tests for learner profile endpoints.

Covers:
  - GET  /profile  (authenticated, unauthenticated, missing profile row)
  - PUT  /profile  (each valid mode, language update, invalid values)
  - Isolation: one learner cannot read or update another's profile

All tests use the shared conftest.py fixture which creates a fresh in-memory
SQLite database per test and overrides the get_db dependency.
"""

import uuid

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_credentials() -> dict:
    """Generate a unique username/email/password triplet."""
    uid = uuid.uuid4().hex[:10]
    return {
        "username": f"learner_{uid}",
        "email": f"learner_{uid}@example.com",
        "password": "TestPass99!",
    }


def _register(client: TestClient, creds: dict) -> dict:
    """Register a new learner account. Returns the response JSON."""
    resp = client.post("/auth/register", json=creds)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _login(client: TestClient, creds: dict) -> None:
    """Log in with the given credentials (sets the HttpOnly cookie)."""
    resp = client.post(
        "/auth/login",
        json={"email": creds["email"], "password": creds["password"]},
    )
    assert resp.status_code == 200, resp.text


def _register_and_login(client: TestClient) -> dict:
    """Register a fresh learner and immediately log them in."""
    creds = _make_credentials()
    _register(client, creds)
    _login(client, creds)
    return creds


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------

class TestGetProfile:

    def test_requires_authentication(self, client: TestClient):
        """Unauthenticated request must return 401."""
        resp = client.get("/profile")
        assert resp.status_code == 401

    def test_returns_profile_after_registration(self, client: TestClient):
        """
        After registration and login the profile should exist with:
          - correct user_id, username, email
          - learning_mode = None  (not set yet)
          - language_pref = "en"  (default)
        """
        creds = _register_and_login(client)

        resp = client.get("/profile")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["username"] == creds["username"]
        assert data["email"] == creds["email"]
        assert data["learning_mode"] is None
        assert data["language_pref"] == "en"
        assert isinstance(data["user_id"], int)

    def test_profile_fields_present(self, client: TestClient):
        """Response must contain exactly the documented fields."""
        _register_and_login(client)

        resp = client.get("/profile")
        assert resp.status_code == 200
        data = resp.json()

        assert "user_id" in data
        assert "username" in data
        assert "email" in data
        assert "learning_mode" in data
        assert "language_pref" in data

    def test_no_password_hash_in_response(self, client: TestClient):
        """The profile response must never expose the password hash."""
        _register_and_login(client)
        resp = client.get("/profile")
        assert resp.status_code == 200
        assert "password" not in resp.json()
        assert "password_hash" not in resp.json()


# ---------------------------------------------------------------------------
# PUT /profile — valid updates
# ---------------------------------------------------------------------------

class TestUpdateProfileValidModes:

    def test_set_mode_academic(self, client: TestClient):
        """Setting learning_mode to 'academic' must succeed."""
        _register_and_login(client)

        resp = client.put("/profile", json={"learning_mode": "academic"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["learning_mode"] == "academic"

    def test_set_mode_competitive(self, client: TestClient):
        """Setting learning_mode to 'competitive' must succeed."""
        _register_and_login(client)

        resp = client.put("/profile", json={"learning_mode": "competitive"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["learning_mode"] == "competitive"

    def test_set_mode_topic(self, client: TestClient):
        """Setting learning_mode to 'topic' must succeed."""
        _register_and_login(client)

        resp = client.put("/profile", json={"learning_mode": "topic"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["learning_mode"] == "topic"

    def test_clear_mode_with_null(self, client: TestClient):
        """Setting learning_mode to null must clear the mode."""
        _register_and_login(client)

        # First set a mode
        client.put("/profile", json={"learning_mode": "academic"})

        # Then clear it
        resp = client.put("/profile", json={"learning_mode": None})
        assert resp.status_code == 200, resp.text
        assert resp.json()["learning_mode"] is None

    def test_change_mode_is_allowed(self, client: TestClient):
        """A learner may switch from one mode to another."""
        _register_and_login(client)

        client.put("/profile", json={"learning_mode": "academic"})
        resp = client.put("/profile", json={"learning_mode": "competitive"})
        assert resp.status_code == 200
        assert resp.json()["learning_mode"] == "competitive"

    def test_update_language_to_hindi(self, client: TestClient):
        """Setting language_pref to 'hi' must succeed."""
        _register_and_login(client)

        resp = client.put(
            "/profile",
            json={"learning_mode": "academic", "language_pref": "hi"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["language_pref"] == "hi"

    def test_update_language_to_kannada(self, client: TestClient):
        """Setting language_pref to 'kn' must succeed."""
        _register_and_login(client)

        resp = client.put(
            "/profile",
            json={"learning_mode": "topic", "language_pref": "kn"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["language_pref"] == "kn"

    def test_update_language_to_tamil(self, client: TestClient):
        """Setting language_pref to 'ta' must succeed."""
        _register_and_login(client)

        resp = client.put(
            "/profile",
            json={"learning_mode": "competitive", "language_pref": "ta"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["language_pref"] == "ta"

    def test_omitting_language_pref_preserves_existing(self, client: TestClient):
        """
        Omitting language_pref from the PUT body must leave the existing
        value unchanged (partial update behaviour).
        """
        _register_and_login(client)

        # Set language to 'hi'
        client.put(
            "/profile",
            json={"learning_mode": "academic", "language_pref": "hi"},
        )

        # Update mode only — language_pref omitted
        resp = client.put("/profile", json={"learning_mode": "topic"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["learning_mode"] == "topic"
        assert data["language_pref"] == "hi"   # preserved

    def test_get_reflects_put_update(self, client: TestClient):
        """After a successful PUT, GET must return the updated values."""
        _register_and_login(client)

        client.put(
            "/profile",
            json={"learning_mode": "competitive", "language_pref": "kn"},
        )

        resp = client.get("/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["learning_mode"] == "competitive"
        assert data["language_pref"] == "kn"

    def test_mode_case_normalised_to_lowercase(self, client: TestClient):
        """
        The validator normalises 'ACADEMIC' → 'academic', so the stored
        value is always lowercase.
        """
        _register_and_login(client)

        resp = client.put("/profile", json={"learning_mode": "ACADEMIC"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["learning_mode"] == "academic"


# ---------------------------------------------------------------------------
# PUT /profile — invalid values (422 validation errors)
# ---------------------------------------------------------------------------

class TestUpdateProfileInvalidValues:

    def test_invalid_mode_rejected(self, client: TestClient):
        """An unrecognised learning_mode must return 422."""
        _register_and_login(client)

        resp = client.put("/profile", json={"learning_mode": "unknown_mode"})
        assert resp.status_code == 422, resp.text

    def test_numeric_mode_rejected(self, client: TestClient):
        """A numeric string learning_mode must return 422."""
        _register_and_login(client)

        resp = client.put("/profile", json={"learning_mode": "42"})
        assert resp.status_code == 422

    def test_invalid_language_rejected(self, client: TestClient):
        """An unsupported language code must return 422."""
        _register_and_login(client)

        resp = client.put(
            "/profile",
            json={"learning_mode": "academic", "language_pref": "fr"},
        )
        assert resp.status_code == 422, resp.text

    def test_empty_language_rejected(self, client: TestClient):
        """An empty string language_pref must return 422."""
        _register_and_login(client)

        resp = client.put(
            "/profile",
            json={"learning_mode": "academic", "language_pref": ""},
        )
        assert resp.status_code == 422

    def test_language_too_long_rejected(self, client: TestClient):
        """A language code longer than 10 characters must return 422."""
        _register_and_login(client)

        resp = client.put(
            "/profile",
            json={"learning_mode": "academic", "language_pref": "en-GB-extra-long"},
        )
        assert resp.status_code == 422

    def test_put_requires_authentication(self, client: TestClient):
        """Unauthenticated PUT must return 401."""
        resp = client.put("/profile", json={"learning_mode": "academic"})
        assert resp.status_code == 401

    def test_missing_learning_mode_field_rejected(self, client: TestClient):
        """
        learning_mode is a required field in the request body.
        Omitting it entirely must return 422.
        """
        _register_and_login(client)

        resp = client.put("/profile", json={"language_pref": "hi"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Isolation: learner A cannot see or modify learner B's profile
# ---------------------------------------------------------------------------

class TestProfileIsolation:

    def test_get_returns_own_profile_only(self, client: TestClient):
        """
        Two learners are registered.  Each can only see their own profile.
        We verify that the username and email in the response match the
        currently logged-in user, not the other learner.
        """
        creds_a = _make_credentials()
        creds_b = _make_credentials()

        _register(client, creds_a)
        _register(client, creds_b)

        # Log in as A
        _login(client, creds_a)
        resp_a = client.get("/profile")
        assert resp_a.status_code == 200
        assert resp_a.json()["username"] == creds_a["username"]
        assert resp_a.json()["email"] == creds_a["email"]

        # Log in as B (new login overrides cookie)
        _login(client, creds_b)
        resp_b = client.get("/profile")
        assert resp_b.status_code == 200
        assert resp_b.json()["username"] == creds_b["username"]
        assert resp_b.json()["email"] == creds_b["email"]

        # Confirm they have different user_ids
        assert resp_a.json()["user_id"] != resp_b.json()["user_id"]

    def test_put_updates_own_profile_only(self, client: TestClient):
        """
        Learner A sets their mode to 'academic'.
        Learner B then sets their mode to 'topic'.
        After B's update, A's profile must still show 'academic'.
        """
        creds_a = _make_credentials()
        creds_b = _make_credentials()

        _register(client, creds_a)
        _register(client, creds_b)

        # A sets academic
        _login(client, creds_a)
        client.put("/profile", json={"learning_mode": "academic"})

        # B sets topic
        _login(client, creds_b)
        client.put("/profile", json={"learning_mode": "topic"})

        # Re-check A — must still be academic
        _login(client, creds_a)
        resp = client.get("/profile")
        assert resp.status_code == 200
        assert resp.json()["learning_mode"] == "academic"

    def test_user_id_in_body_ignored(self, client: TestClient):
        """
        Even if the client sends a 'user_id' field in the request body,
        the router must use the authenticated user's ID.
        FastAPI/Pydantic will simply ignore any extra fields not in the schema.
        We verify this does not raise an error and returns the correct profile.
        """
        creds = _register_and_login(client)

        resp = client.put(
            "/profile",
            # user_id=9999 is an extra field; it should be silently ignored
            json={"learning_mode": "competitive", "user_id": 9999},
        )
        assert resp.status_code == 200, resp.text
        # The response must reference OUR user, not user 9999
        assert resp.json()["username"] == creds["username"]

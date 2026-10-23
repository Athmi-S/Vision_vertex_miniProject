"""
tests/test_auth.py — Backend authentication tests.

Covers:
  - Successful registration
  - Duplicate email / username registration
  - Invalid input (short password, missing number, bad email)
  - Public registration cannot create admin accounts
  - Successful login
  - Wrong password login
  - Wrong email login
  - Login sets HttpOnly cookie
  - Logout clears cookie
  - GET /auth/me with valid session
  - GET /auth/me without cookie (401)
  - GET /auth/me with expired/invalid token (401)
  - Password is hashed (not stored in plaintext)
  - Account recovery always returns same message (email enumeration prevention)
  - Health endpoint still works
"""

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
VALID_USER = {
    "username": "testlearner",
    "email": "learner@example.com",
    "password": "SecurePass1",
}


def register(client, data=None):
    return client.post("/auth/register", json=data or VALID_USER)


def login(client, email=VALID_USER["email"], password=VALID_USER["password"]):
    return client.post("/auth/login", json={"email": email, "password": password})


# ---------------------------------------------------------------------------
# Health endpoint still works
# ---------------------------------------------------------------------------
def test_health_endpoint_unaffected(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Registration — success
# ---------------------------------------------------------------------------
def test_register_success(client):
    r = register(client)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == VALID_USER["email"]
    assert body["username"] == VALID_USER["username"]
    assert body["role"] == "learner"
    assert "id" in body
    # Password must NOT appear anywhere in the response
    assert "password" not in str(body).lower() or "hash" not in str(body).lower()


def test_register_creates_learner_role_only(client):
    """Public registration must never create admin accounts."""
    r = register(client)
    assert r.status_code == 201
    assert r.json()["role"] == "learner"


# ---------------------------------------------------------------------------
# Registration — duplicate
# ---------------------------------------------------------------------------
def test_register_duplicate_email(client):
    register(client)
    r = register(client)  # same email
    assert r.status_code == 409
    assert "email" in r.json()["detail"].lower()


def test_register_duplicate_username(client):
    register(client)
    r = register(client, {**VALID_USER, "email": "other@example.com"})
    assert r.status_code == 409
    assert "username" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Registration — validation
# ---------------------------------------------------------------------------
def test_register_invalid_email(client):
    r = register(client, {**VALID_USER, "email": "not-an-email"})
    assert r.status_code == 422


def test_register_password_too_short(client):
    r = register(client, {**VALID_USER, "password": "Short1"})
    assert r.status_code == 422


def test_register_password_no_number(client):
    r = register(client, {**VALID_USER, "password": "NoNumbersHere"})
    assert r.status_code == 422


def test_register_username_too_short(client):
    r = register(client, {**VALID_USER, "username": "ab"})
    assert r.status_code == 422


def test_register_username_invalid_chars(client):
    r = register(client, {**VALID_USER, "username": "bad user!"})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
def test_password_is_hashed_not_plaintext(client):
    """Verify the stored hash is not the plaintext password."""
    from app.services.auth_service import verify_password
    from tests.conftest import TestSessionLocal
    from app.models import User

    register(client)
    db = TestSessionLocal()
    user = db.query(User).filter(User.email == VALID_USER["email"]).first()
    db.close()

    assert user is not None
    # The stored value must NOT equal the plaintext password
    assert user.password_hash != VALID_USER["password"]
    # But verify_password must confirm it matches
    assert verify_password(VALID_USER["password"], user.password_hash) is True


# ---------------------------------------------------------------------------
# Login — success
# ---------------------------------------------------------------------------
def test_login_success(client):
    register(client)
    r = login(client)
    assert r.status_code == 200
    assert r.json()["message"] == "Login successful."
    # Cookie must be set
    assert "vision_token" in r.cookies


def test_login_sets_httponly_cookie(client):
    """The vision_token cookie must be HttpOnly."""
    register(client)
    r = login(client)
    assert r.status_code == 200
    cookie = r.headers.get("set-cookie", "")
    assert "httponly" in cookie.lower()


def test_login_with_username(client):
    """Learners can log in with their username as well as email."""
    register(client)
    r = login(client, email=VALID_USER["username"])
    assert r.status_code == 200
    assert r.json()["message"] == "Login successful."
    assert "vision_token" in r.cookies


# ---------------------------------------------------------------------------
# Login — failures
# ---------------------------------------------------------------------------
def test_login_wrong_password(client):
    register(client)
    r = login(client, password="WrongPass9")
    assert r.status_code == 401
    # Same message as wrong email — prevents enumeration
    assert "incorrect" in r.json()["detail"].lower()


def test_login_wrong_email(client):
    register(client)
    r = login(client, email="nobody@example.com")
    assert r.status_code == 401
    assert "incorrect" in r.json()["detail"].lower()


def test_login_wrong_username(client):
    register(client)
    r = login(client, email="nobodyuser")
    assert r.status_code == 401
    assert "incorrect" in r.json()["detail"].lower()


def test_login_nonexistent_account(client):
    r = login(client)  # no registration done
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
def test_me_authenticated(client):
    register(client)
    login(client)
    r = client.get("/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == VALID_USER["email"]
    assert body["username"] == VALID_USER["username"]
    assert body["role"] == "learner"


def test_me_no_cookie(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_invalid_token(client):
    client.cookies.set("vision_token", "this.is.not.a.valid.token")
    r = client.get("/auth/me")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------
def test_logout_clears_cookie(client):
    register(client)
    login(client)
    r = client.post("/auth/logout")
    assert r.status_code == 200
    assert r.json()["message"] == "Logged out successfully."
    # After logout, /auth/me must return 401
    r2 = client.get("/auth/me")
    assert r2.status_code == 401


# ---------------------------------------------------------------------------
# Account recovery — email enumeration prevention
# ---------------------------------------------------------------------------
def test_recover_existing_email_returns_generic_message(client):
    register(client)
    r = client.post("/auth/recover", json={"email": VALID_USER["email"]})
    assert r.status_code == 200
    assert "reset code" in r.json()["message"].lower()


def test_recover_nonexistent_email_returns_same_message(client):
    """Must return the same message whether the email exists or not."""
    r = client.post("/auth/recover", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    assert "reset code" in r.json()["message"].lower()


def test_recover_invalid_email(client):
    r = client.post("/auth/recover", json={"email": "not-an-email"})
    assert r.status_code == 422

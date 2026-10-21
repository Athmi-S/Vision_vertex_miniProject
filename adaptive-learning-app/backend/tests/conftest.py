"""
tests/conftest.py — Shared pytest fixtures for all backend tests.

Uses an in-memory SQLite database so tests never touch vision.db.
Each test function gets a fresh database via the `client` fixture.
"""

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set a test SECRET_KEY before importing main (which validates it on import)
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-1234567890ab")
os.environ.setdefault("APP_ENV", "development")

from app.database import Base, get_db  # noqa: E402
from main import app                   # noqa: E402

# In-memory SQLite — separate from vision.db
TEST_DATABASE_URL = "sqlite:///./test_vision.db"

test_engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    """Create all tables before each test, drop them after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """Return a TestClient with the DB dependency overridden."""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()

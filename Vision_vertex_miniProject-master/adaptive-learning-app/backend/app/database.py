"""
app/database.py — Database engine and session management
=========================================================

Sets up a SQLite database using SQLAlchemy.

Usage
-----
Import `get_db` as a FastAPI dependency in any router:

    from app.database import get_db
    from sqlalchemy.orm import Session

    @router.get("/example")
    def example(db: Session = Depends(get_db)):
        ...

Import `Base` in models.py to declare table classes.
Import `engine` in main.py to call Base.metadata.create_all(engine).
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# ---------------------------------------------------------------------------
# Load environment variables from .env (if it exists).
# Falls back silently if .env is missing (e.g. in CI environments).
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Database URL
# Default: SQLite file "vision.db" created inside the backend/ directory.
# Override by setting DATABASE_URL in your .env file.
# ---------------------------------------------------------------------------
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./vision.db")

# ---------------------------------------------------------------------------
# SQLAlchemy engine
# connect_args={"check_same_thread": False} is required for SQLite only.
# It allows the same connection to be used across multiple threads (FastAPI
# runs request handlers in a thread pool).
# ---------------------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,   # Set to True temporarily to log all SQL queries during dev
)

# ---------------------------------------------------------------------------
# Session factory
# autocommit=False  — changes must be committed explicitly with db.commit()
# autoflush=False   — prevents accidental flushes before a commit
# ---------------------------------------------------------------------------
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ---------------------------------------------------------------------------
# Declarative base
# All SQLAlchemy model classes must inherit from this Base.
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# FastAPI dependency: get_db()
#
# Yields a database session for the duration of one HTTP request, then
# closes it automatically — even if the request raises an exception.
#
# Example usage in a router:
#   def my_endpoint(db: Session = Depends(get_db)):
# ---------------------------------------------------------------------------
def get_db():
    """Yield a SQLAlchemy session and close it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

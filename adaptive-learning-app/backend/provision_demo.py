"""
provision_demo.py — Create (or reset) the VISION demo account.
==============================================================

This script provisions a dedicated demo learner account that the
frontend's "Demo Login" feature uses.  The demo account is an
ordinary learner account — it goes through the same bcrypt hashing
and JWT cookie flow as every other account.  No authentication is
bypassed.

Credentials written to the database and matched in the backend's
POST /auth/demo-login endpoint are controlled by .env so they are
NEVER hard-coded in frontend code.

Usage (from backend/ with the venv active):
    python provision_demo.py

Safe to re-run: if the account already exists the password hash is
updated so it always matches the current DEMO_PASSWORD value.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal, engine, Base
from app.models import User, LearnerProfile
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Demo credentials — read from .env with safe defaults for local dev.
# In a real deployment these would come from a secrets manager.
# ---------------------------------------------------------------------------
DEMO_EMAIL: str = os.getenv("DEMO_EMAIL", "demo@vision-learning.app")
DEMO_USERNAME: str = os.getenv("DEMO_USERNAME", "demo_user")
DEMO_PASSWORD: str = os.getenv("DEMO_PASSWORD", "DemoAccess2025!")

# Ensure tables exist
Base.metadata.create_all(bind=engine)


def provision(db) -> None:
    existing = db.query(User).filter(User.email == DEMO_EMAIL).first()

    if existing:
        # Update password hash in case DEMO_PASSWORD changed
        existing.password_hash = hash_password(DEMO_PASSWORD)
        existing.is_active = True
        db.commit()
        print(f"[provision_demo] Demo account already exists — password hash refreshed.")
        print(f"  email    : {DEMO_EMAIL}")
        print(f"  username : {existing.username}")
    else:
        user = User(
            username=DEMO_USERNAME,
            email=DEMO_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            role="learner",
            is_active=True,
        )
        db.add(user)
        db.flush()

        profile = LearnerProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(user)

        print(f"[provision_demo] Demo account created successfully.")
        print(f"  email    : {DEMO_EMAIL}")
        print(f"  username : {DEMO_USERNAME}")
        print(f"  user id  : {user.id}")

    print("\n  The backend POST /auth/demo-login endpoint will authenticate")
    print("  this account.  Credentials are never sent to the frontend.\n")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        provision(db)
    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        db.close()

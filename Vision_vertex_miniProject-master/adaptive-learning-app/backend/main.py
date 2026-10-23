"""
main.py – VISION Adaptive Learning Platform
FastAPI application entry point.

Stage 2 additions:
  - Registered /auth router (register, login, logout, me, recover)
  - allow_credentials=True on CORS so HttpOnly cookies are sent cross-origin
  - Cookie-based JWT authentication (HttpOnly, SameSite=Lax)

Stage 3 (Step B) additions:
  - Registered /assessment router (subjects, start, question, answer, result)

Stage 3 (Step C) additions:
  - Registered /profile router (GET /profile, PUT /profile)
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before anything that reads environment variables
load_dotenv()

from app.database import Base, engine  # noqa: E402
from app.routers import health         # noqa: E402
from app.routers import auth           # noqa: E402
from app.routers import assessment     # noqa: E402
from app.routers import profile        # noqa: E402

# Import all models so SQLAlchemy registers their tables with Base.metadata
import app.models  # noqa: F401, E402

# Create all database tables on startup (skips tables that already exist)
Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------
app = FastAPI(
    title="VISION Adaptive Learning API",
    description=(
        "Backend for the Behaviour-Aware Adaptive Teaching Strategy Selection "
        "platform for visually impaired students."
    ),
    version="0.5.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# allow_credentials=True is required so the browser sends the HttpOnly cookie
# on cross-origin requests from the Vite dev server.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",   # fallback if Vite uses a different port
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin",
                   "X-Requested-With"],
    expose_headers=["Set-Cookie"],
    max_age=600,
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(assessment.router)
app.include_router(profile.router)

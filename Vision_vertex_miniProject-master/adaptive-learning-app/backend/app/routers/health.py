"""
health.py – Health-check router

Exposes a single GET /health endpoint that confirms the backend is running.
Monitoring tools, CI pipelines, and the frontend can all call this endpoint
to verify connectivity before attempting real API calls.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    message: str
    version: str


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Backend health check",
    description="Returns a JSON object confirming the backend service is running.",
)
def health_check() -> HealthResponse:
    """
    Health-check endpoint.

    Returns:
        HealthResponse: status, human-readable message, and API version.
    """
    return HealthResponse(
        status="ok",
        message="VISION Adaptive Learning backend is running.",
        version="0.1.0",
    )

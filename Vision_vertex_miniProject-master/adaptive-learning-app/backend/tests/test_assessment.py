"""
tests/test_assessment.py — Integration tests for assessment endpoints.

Tests cover:
  - GET  /assessment/subjects
  - POST /assessment/start
  - GET  /assessment/question/{question_id}
  - POST /assessment/answer
  - GET  /assessment/result/{session_id}

All tests run against the in-memory test database (see conftest.py).
Seed data is inserted per-test via the `seeded_client` fixture so that
questions exist for the assessment flow.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register_and_login(client: TestClient) -> dict:
    """Register a fresh learner and log in; return the logged-in client."""
    username = f"testlearner_{uuid.uuid4().hex[:8]}"
    email = f"{username}@example.com"
    password = "TestPass123!"

    resp = client.post(
        "/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return {"username": username, "email": email, "password": password}


def _seed_subject_topic_question(db_session) -> dict:
    """
    Insert one Subject, one Topic, one Question with four options (one correct)
    and one QuestionI18n row directly into the test database.

    Returns a dict with the inserted IDs.
    """
    from app.models import (
        Question,
        QuestionI18n,
        QuestionOption,
        Subject,
        Topic,
    )

    subject = Subject(name="Mathematics", code="MATH")
    db_session.add(subject)
    db_session.flush()

    topic = Topic(
        name="Algebra",
        subject_id=subject.id,
        order_index=1,
    )
    db_session.add(topic)
    db_session.flush()

    question = Question(
        topic_id=topic.id,
        question_text="What is 2 + 2?",
        question_type="mcq",
        difficulty="easy",
        is_active=True,
    )
    db_session.add(question)
    db_session.flush()

    options = [
        QuestionOption(question_id=question.id, option_text="3",  is_correct=False),
        QuestionOption(question_id=question.id, option_text="4",  is_correct=True),
        QuestionOption(question_id=question.id, option_text="5",  is_correct=False),
        QuestionOption(question_id=question.id, option_text="22", is_correct=False),
    ]
    for opt in options:
        db_session.add(opt)
    db_session.flush()

    i18n = QuestionI18n(
        question_id=question.id,
        language_code="en",
        question_text="What is 2 + 2?",
        explanation="2 plus 2 equals 4.",
    )
    db_session.add(i18n)
    db_session.commit()

    correct_opt = next(o for o in options if o.is_correct)

    return {
        "subject_id": subject.id,
        "topic_id": topic.id,
        "question_id": question.id,
        "correct_option_id": correct_opt.id,
        "wrong_option_id": options[0].id,   # "3" — always wrong
    }


# ---------------------------------------------------------------------------
# Fixture: authenticated client with seeded data
# ---------------------------------------------------------------------------

from sqlalchemy.orm import Session as SASession  # noqa: E402

@pytest.fixture
def seeded_client(client: TestClient):
    """
    Returns (client, seed_ids) where the client is already logged in and
    seed_ids is the dict returned by _seed_subject_topic_question.
    """
    from app.database import get_db
    from main import app

    # Get a real DB session to insert seed data
    from tests.conftest import TestSessionLocal

    db: SASession = TestSessionLocal()
    try:
        seed_ids = _seed_subject_topic_question(db)
    finally:
        db.close()

    _register_and_login(client)
    return client, seed_ids


# ---------------------------------------------------------------------------
# GET /assessment/subjects
# ---------------------------------------------------------------------------

class TestListSubjects:

    def test_requires_auth(self, client: TestClient):
        """Unauthenticated requests must be rejected with 401."""
        resp = client.get("/assessment/subjects")
        assert resp.status_code == 401

    def test_returns_empty_when_no_subjects(self, client: TestClient):
        """Returns an empty list when the database has no subjects."""
        _register_and_login(client)
        resp = client.get("/assessment/subjects")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_subjects_with_topics(self, seeded_client):
        """Returns subjects with nested topics after seeding."""
        client, seed_ids = seeded_client
        resp = client.get("/assessment/subjects")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

        subject = next((s for s in data if s["id"] == seed_ids["subject_id"]), None)
        assert subject is not None
        assert subject["code"] == "MATH"
        assert len(subject["topics"]) >= 1
        topic = subject["topics"][0]
        assert topic["id"] == seed_ids["topic_id"]
        assert topic["name"] == "Algebra"


# ---------------------------------------------------------------------------
# POST /assessment/start
# ---------------------------------------------------------------------------

class TestStartAssessment:

    def test_requires_auth(self, client: TestClient):
        resp = client.post(
            "/assessment/start",
            json={"session_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 401

    def test_returns_question_ids(self, seeded_client):
        """Returns a non-empty question_ids list for a valid session."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        resp = client.post(
            "/assessment/start",
            json={"session_id": session_id, "topic_id": seed_ids["topic_id"]},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["session_id"] == session_id
        assert data["total_questions"] >= 1
        assert seed_ids["question_id"] in data["question_ids"]

    def test_no_questions_for_unknown_topic(self, seeded_client):
        """Returns 404 when no questions match the given topic."""
        client, _ = seeded_client
        resp = client.post(
            "/assessment/start",
            json={"session_id": str(uuid.uuid4()), "topic_id": 9999},
        )
        assert resp.status_code == 404

    def test_duplicate_session_id_rejected(self, seeded_client):
        """Returns 409 when the same session_id is reused after answering."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        # Start the session
        resp = client.post(
            "/assessment/start",
            json={"session_id": session_id, "topic_id": seed_ids["topic_id"]},
        )
        assert resp.status_code == 201

        # Answer one question to create an attempt for this session
        client.post(
            "/assessment/answer",
            json={
                "session_id": session_id,
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["correct_option_id"],
            },
        )

        # Trying to start again with the same session_id must fail
        resp2 = client.post(
            "/assessment/start",
            json={"session_id": session_id, "topic_id": seed_ids["topic_id"]},
        )
        assert resp2.status_code == 409

    def test_empty_session_id_rejected(self, seeded_client):
        """An empty string session_id must be rejected by the validator."""
        client, _ = seeded_client
        resp = client.post(
            "/assessment/start",
            json={"session_id": "   "},
        )
        assert resp.status_code == 422

    def test_session_id_too_long_rejected(self, seeded_client):
        """A session_id longer than 36 characters must be rejected."""
        client, _ = seeded_client
        resp = client.post(
            "/assessment/start",
            json={"session_id": "a" * 37},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /assessment/question/{question_id}
# ---------------------------------------------------------------------------

class TestGetQuestion:

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/assessment/question/1")
        assert resp.status_code == 401

    def test_returns_question_without_is_correct(self, seeded_client):
        """
        Question response must contain options but MUST NOT expose is_correct.
        This is a security-critical test.
        """
        client, seed_ids = seeded_client
        resp = client.get(f"/assessment/question/{seed_ids['question_id']}")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["id"] == seed_ids["question_id"]
        assert data["question_text"] == "What is 2 + 2?"
        assert data["difficulty"] == "easy"
        assert len(data["options"]) == 4
        assert data["explanation"] is None   # not revealed before submission

        # CRITICAL: is_correct must not appear in any option
        for opt in data["options"]:
            assert "is_correct" not in opt, (
                "is_correct was leaked in the question response — security violation!"
            )

    def test_unknown_question_returns_404(self, seeded_client):
        client, _ = seeded_client
        resp = client.get("/assessment/question/9999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /assessment/answer
# ---------------------------------------------------------------------------

class TestSubmitAnswer:

    def test_requires_auth(self, client: TestClient):
        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": str(uuid.uuid4()),
                "question_id": 1,
                "selected_option_id": 1,
            },
        )
        assert resp.status_code == 401

    def test_correct_answer(self, seeded_client):
        """Submitting the correct option returns is_correct=True."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": session_id,
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["correct_option_id"],
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["is_correct"] is True
        assert data["correct_option_id"] == seed_ids["correct_option_id"]
        assert data["explanation"] == "2 plus 2 equals 4."
        assert data["skipped"] is False

    def test_wrong_answer(self, seeded_client):
        """Submitting a wrong option returns is_correct=False."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": session_id,
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["wrong_option_id"],
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["is_correct"] is False
        assert data["correct_option_id"] == seed_ids["correct_option_id"]
        assert data["skipped"] is False

    def test_skipped_answer(self, seeded_client):
        """Skipping a question stores skipped=True and is_correct=None."""
        client, seed_ids = seeded_client

        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": str(uuid.uuid4()),
                "question_id": seed_ids["question_id"],
                "skipped": True,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["skipped"] is True
        assert data["is_correct"] is None

    def test_invalid_question_rejected(self, seeded_client):
        """Submitting an answer for a non-existent question returns 400."""
        client, _ = seeded_client

        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": str(uuid.uuid4()),
                "question_id": 9999,
                "selected_option_id": 1,
            },
        )
        assert resp.status_code == 400

    def test_option_from_wrong_question_rejected(self, seeded_client):
        """
        Submitting an option that belongs to a different question must be rejected.
        This prevents cross-question answer injection.
        """
        client, seed_ids = seeded_client
        # option_id=1 may belong to a different question (or not exist) — either
        # way it should not belong to question_id=9999
        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": str(uuid.uuid4()),
                "question_id": seed_ids["question_id"],
                "selected_option_id": 99999,   # non-existent option
            },
        )
        assert resp.status_code == 400

    def test_negative_response_time_rejected(self, seeded_client):
        """response_time_ms must be a non-negative integer."""
        client, seed_ids = seeded_client

        resp = client.post(
            "/assessment/answer",
            json={
                "session_id": str(uuid.uuid4()),
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["correct_option_id"],
                "response_time_ms": -500,
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /assessment/result/{session_id}
# ---------------------------------------------------------------------------

class TestSessionResult:

    def test_requires_auth(self, client: TestClient):
        resp = client.get(f"/assessment/result/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_result_after_one_correct_answer(self, seeded_client):
        """After one correct answer the score_percent should be 100.0."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        # Submit a correct answer
        client.post(
            "/assessment/answer",
            json={
                "session_id": session_id,
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["correct_option_id"],
            },
        )

        resp = client.get(f"/assessment/result/{session_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["session_id"] == session_id
        assert data["total_questions"] == 1
        assert data["correct"] == 1
        assert data["skipped"] == 0
        assert data["score_percent"] == 100.0
        assert len(data["topic_breakdown"]) >= 1

    def test_result_after_wrong_answer(self, seeded_client):
        """After one wrong answer the score_percent should be 0.0."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        client.post(
            "/assessment/answer",
            json={
                "session_id": session_id,
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["wrong_option_id"],
            },
        )

        resp = client.get(f"/assessment/result/{session_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["correct"] == 0
        assert data["score_percent"] == 0.0

    def test_empty_session_returns_404(self, seeded_client):
        """A session with no attempts must return 404."""
        client, _ = seeded_client
        resp = client.get(f"/assessment/result/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_topic_breakdown_included(self, seeded_client):
        """The topic_breakdown must include mastery_score after an answer."""
        client, seed_ids = seeded_client
        session_id = str(uuid.uuid4())

        client.post(
            "/assessment/answer",
            json={
                "session_id": session_id,
                "question_id": seed_ids["question_id"],
                "selected_option_id": seed_ids["correct_option_id"],
            },
        )

        resp = client.get(f"/assessment/result/{session_id}")
        assert resp.status_code == 200
        breakdown = resp.json()["topic_breakdown"]
        assert len(breakdown) >= 1

        topic_entry = next(
            (t for t in breakdown if t["topic_id"] == seed_ids["topic_id"]),
            None,
        )
        assert topic_entry is not None
        assert topic_entry["topic_name"] == "Algebra"
        assert 0.0 <= topic_entry["mastery_score"] <= 1.0

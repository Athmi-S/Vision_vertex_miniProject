"""
app/schemas/assessment.py — Pydantic schemas for assessment endpoints.

Request and response models are deliberately separate from SQLAlchemy models.
Correct answer flags are NEVER included in question/option response schemas
to prevent leaking answers before the learner submits.
"""

from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Subjects and topics (read-only catalogue)
# ---------------------------------------------------------------------------
class TopicOut(BaseModel):
    id: int
    name: str
    order_index: int


class SubjectOut(BaseModel):
    id: int
    name: str
    code: str
    topics: list[TopicOut]


# ---------------------------------------------------------------------------
# Assessment start
# ---------------------------------------------------------------------------
class StartAssessmentRequest(BaseModel):
    """
    The client generates a UUID session_id before calling this endpoint.
    The same session_id must be passed with every subsequent answer.
    Using a client-generated UUID keeps the API stateless.
    """
    session_id: str
    subject_id: int | None = None   # None = all subjects (full diagnostic)
    topic_id: int | None = None     # None = all topics within subject

    @field_validator("session_id")
    @classmethod
    def session_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("session_id must not be empty.")
        if len(v) > 36:
            raise ValueError("session_id must be 36 characters or fewer (UUID).")
        return v


class StartAssessmentResponse(BaseModel):
    session_id: str
    total_questions: int
    question_ids: list[int]   # ordered list of question IDs for this session
    message: str


# ---------------------------------------------------------------------------
# Question retrieval (correct answers NEVER exposed)
# ---------------------------------------------------------------------------
class OptionOut(BaseModel):
    """Answer option — is_correct is deliberately excluded."""
    id: int
    option_text: str


class QuestionOut(BaseModel):
    """A single question with its options — is_correct NOT included."""
    id: int
    question_text: str
    question_type: str
    difficulty: str
    topic_id: int
    topic_name: str
    options: list[OptionOut]
    explanation: str | None = None   # only populated AFTER submission


# ---------------------------------------------------------------------------
# Answer submission
# ---------------------------------------------------------------------------
class SubmitAnswerRequest(BaseModel):
    session_id: str
    question_id: int
    selected_option_id: int | None = None   # None = skipped
    response_time_ms: int | None = None
    help_requested: bool = False
    skipped: bool = False

    @field_validator("session_id")
    @classmethod
    def session_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("session_id must not be empty.")
        return v

    @field_validator("response_time_ms")
    @classmethod
    def positive_response_time(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("response_time_ms must be a non-negative integer.")
        return v


class SubmitAnswerResponse(BaseModel):
    attempt_id: int
    question_id: int
    is_correct: bool | None
    skipped: bool
    correct_option_id: int | None   # revealed AFTER submission
    explanation: str | None         # read aloud by TTS after submission


# ---------------------------------------------------------------------------
# Session results
# ---------------------------------------------------------------------------
class TopicMasteryOut(BaseModel):
    topic_id: int
    topic_name: str
    mastery_score: float
    correct: int
    total: int


class SessionResultResponse(BaseModel):
    session_id: str
    total_questions: int
    answered: int
    correct: int
    skipped: int
    score_percent: float
    topic_breakdown: list[TopicMasteryOut]
    message: str

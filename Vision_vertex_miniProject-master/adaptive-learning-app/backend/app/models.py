"""
app/models.py — SQLAlchemy database models
===========================================

Defines every table used by the VISION platform.
All classes inherit from Base (defined in app/database.py).

Table summary
-------------
  users               — learners and admins
  subjects            — top-level academic subjects
  topics              — sub-topics within a subject
  questions           — diagnostic/assessment questions
  question_options    — answer options for each question
  question_i18n       — multilingual versions of question text
  learner_profiles    — per-learner preferences and mode
  assessment_attempts — every answer attempt by a learner
  concept_mastery     — estimated mastery score per topic per learner

NOTE: No data is inserted here. This file only creates the schema.
      Auth logic, admin seeding, and assessment logic come in later stages.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# users
# ---------------------------------------------------------------------------
class User(Base):
    """
    Stores both learner and admin accounts.
    Role is enforced on every protected endpoint by the auth dependency.
    Passwords are NEVER stored in plaintext — use passlib to hash them.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # 'learner' or 'admin'
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="learner")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    learner_profile: Mapped["LearnerProfile"] = relationship(
        "LearnerProfile", back_populates="user", uselist=False
    )
    attempts: Mapped[list["AssessmentAttempt"]] = relationship(
        "AssessmentAttempt", back_populates="learner"
    )
    mastery_records: Mapped[list["ConceptMastery"]] = relationship(
        "ConceptMastery", back_populates="learner"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role!r}>"


# ---------------------------------------------------------------------------
# subjects
# ---------------------------------------------------------------------------
class Subject(Base):
    """
    Top-level academic subjects (e.g. Mathematics, Physics, General Knowledge).
    Added and managed by admins through the admin content API (Stage 3).
    """

    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Short unique code, e.g. 'MATH', 'PHY', 'GK'
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    topics: Mapped[list["Topic"]] = relationship("Topic", back_populates="subject")

    def __repr__(self) -> str:
        return f"<Subject id={self.id} code={self.code!r}>"


# ---------------------------------------------------------------------------
# topics
# ---------------------------------------------------------------------------
class Topic(Base):
    """
    Sub-topics within a subject (e.g. Algebra, Calculus under Mathematics).
    order_index controls display order in the UI and assessment flow.
    """

    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subject_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subjects.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    subject: Mapped["Subject"] = relationship("Subject", back_populates="topics")
    questions: Mapped[list["Question"]] = relationship(
        "Question", back_populates="topic"
    )
    mastery_records: Mapped[list["ConceptMastery"]] = relationship(
        "ConceptMastery", back_populates="topic"
    )

    def __repr__(self) -> str:
        return f"<Topic id={self.id} name={self.name!r}>"


# ---------------------------------------------------------------------------
# questions
# ---------------------------------------------------------------------------
class Question(Base):
    """
    Assessment/diagnostic questions.
    question_type: 'mcq' | 'true_false' | 'fill_blank'
    difficulty:    'easy' | 'medium' | 'hard'
    """

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id"), nullable=False
    )
    # The admin user who created this question
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), default="mcq")
    difficulty: Mapped[str] = mapped_column(String(10), default="medium")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    topic: Mapped["Topic"] = relationship("Topic", back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        "QuestionOption", back_populates="question", cascade="all, delete-orphan"
    )
    translations: Mapped[list["QuestionI18n"]] = relationship(
        "QuestionI18n", back_populates="question", cascade="all, delete-orphan"
    )
    attempts: Mapped[list["AssessmentAttempt"]] = relationship(
        "AssessmentAttempt", back_populates="question"
    )

    def __repr__(self) -> str:
        return f"<Question id={self.id} type={self.question_type!r}>"


# ---------------------------------------------------------------------------
# question_options
# ---------------------------------------------------------------------------
class QuestionOption(Base):
    """
    Answer choices for a question.
    Exactly one option per question should have is_correct=True for MCQ.
    """

    __tablename__ = "question_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id"), nullable=False
    )
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    question: Mapped["Question"] = relationship("Question", back_populates="options")

    def __repr__(self) -> str:
        return f"<QuestionOption id={self.id} correct={self.is_correct}>"


# ---------------------------------------------------------------------------
# question_i18n  (internationalisation)
# ---------------------------------------------------------------------------
class QuestionI18n(Base):
    """
    Multilingual translations of question text and explanations.
    language_code follows BCP-47: 'en', 'hi', 'kn', 'ta', etc.
    Stage 1 only stores English content; this table is ready for Stage 6.
    """

    __tablename__ = "question_i18n"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id"), nullable=False
    )
    language_code: Mapped[str] = mapped_column(String(10), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional spoken explanation read aloud after the learner answers
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    question: Mapped["Question"] = relationship(
        "Question", back_populates="translations"
    )

    def __repr__(self) -> str:
        return f"<QuestionI18n id={self.id} lang={self.language_code!r}>"


# ---------------------------------------------------------------------------
# learner_profiles
# ---------------------------------------------------------------------------
class LearnerProfile(Base):
    """
    One-to-one extension of User for learner-specific preferences.
    Created automatically when a learner registers (Stage 2).
    learning_mode: 'academic' | 'competitive' | 'topic'
    """

    __tablename__ = "learner_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), unique=True, nullable=False
    )
    learning_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    language_pref: Mapped[str] = mapped_column(String(10), default="en")

    user: Mapped["User"] = relationship("User", back_populates="learner_profile")

    def __repr__(self) -> str:
        return f"<LearnerProfile user_id={self.user_id} mode={self.learning_mode!r}>"


# ---------------------------------------------------------------------------
# assessment_attempts
# ---------------------------------------------------------------------------
class AssessmentAttempt(Base):
    """
    Records every answer a learner gives to a question.

    session_id groups all attempts that belong to one diagnostic run.
    It is a client-generated UUID supplied when the assessment starts and
    echoed back on every subsequent answer in that session. The backend
    validates that it is a non-empty string but does not generate it —
    this keeps the API stateless.

    Tracked fields feed the adaptive teaching strategy module:
      - is_correct        — did the learner answer correctly?
      - attempts_count    — how many tries on this question?
      - response_time_ms  — milliseconds from question shown to answer submitted
      - help_requested    — did the learner ask for a hint or explanation?
      - skipped           — did the learner skip without answering?
    """

    __tablename__ = "assessment_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    learner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id"), nullable=False
    )
    # Groups all attempts in one diagnostic session. UUID string, set by client.
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # The option the learner selected (null if skipped or fill-blank)
    selected_option_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("question_options.id"), nullable=True
    )
    # For fill-blank questions
    text_answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    attempts_count: Mapped[int] = mapped_column(Integer, default=1)
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    help_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    learner: Mapped["User"] = relationship("User", back_populates="attempts")
    question: Mapped["Question"] = relationship(
        "Question", back_populates="attempts"
    )

    def __repr__(self) -> str:
        return f"<AssessmentAttempt id={self.id} session={self.session_id!r} correct={self.is_correct}>"


# ---------------------------------------------------------------------------
# concept_mastery
# ---------------------------------------------------------------------------
class ConceptMastery(Base):
    """
    Estimated mastery score for a learner on a specific topic.
    mastery_score is a float from 0.0 (no knowledge) to 1.0 (full mastery).
    Updated by the assessment service after each attempt (Stage 5).
    """

    __tablename__ = "concept_mastery"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    learner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id"), nullable=False
    )
    mastery_score: Mapped[float] = mapped_column(Float, default=0.0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    learner: Mapped["User"] = relationship("User", back_populates="mastery_records")
    topic: Mapped["Topic"] = relationship("Topic", back_populates="mastery_records")

    def __repr__(self) -> str:
        return f"<ConceptMastery learner={self.learner_id} topic={self.topic_id} score={self.mastery_score}>"

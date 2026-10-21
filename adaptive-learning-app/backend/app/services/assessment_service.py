"""
app/services/assessment_service.py — Business logic for diagnostic assessment.

Responsibilities:
  - Select questions for a new session
  - Score a submitted answer
  - Update concept mastery using a simple, documented baseline formula
  - Compute session summary statistics

The mastery update formula used here is intentionally simple.
Member 3's behaviour-aware adaptive engine will replace it in a later stage.

Mastery formula (baseline):
  - Correct answer  : new_score = min(old_score + 0.1, 1.0)
  - Wrong answer    : new_score = max(old_score - 0.05, 0.0)
  - Skipped         : score unchanged
  - Scores are clamped to [0.0, 1.0]
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import (
    AssessmentAttempt,
    ConceptMastery,
    Question,
    QuestionI18n,
    QuestionOption,
    Subject,
    Topic,
)

# Number of questions to select per topic when running a full diagnostic
QUESTIONS_PER_TOPIC = 3

# Mastery delta constants (documented here for Member 3 to replace)
MASTERY_GAIN_CORRECT = 0.10
MASTERY_LOSS_WRONG   = 0.05


# ---------------------------------------------------------------------------
# Question selection
# ---------------------------------------------------------------------------

def select_questions(
    db: Session,
    subject_id: int | None,
    topic_id: int | None,
) -> list[int]:
    """
    Return an ordered list of active question IDs for a new assessment session.

    Selection strategy (balanced difficulty):
      - If topic_id given  : up to QUESTIONS_PER_TOPIC per difficulty from that topic
      - If subject_id given: same but across all topics in the subject
      - If neither given   : all subjects, all topics

    Questions are ordered by topic then difficulty (easy, medium, hard).
    """
    q = db.query(Question).filter(Question.is_active == True)  # noqa: E712

    if topic_id is not None:
        q = q.filter(Question.topic_id == topic_id)
    elif subject_id is not None:
        topic_ids = [
            t.id for t in db.query(Topic).filter(Topic.subject_id == subject_id).all()
        ]
        if not topic_ids:
            return []
        q = q.filter(Question.topic_id.in_(topic_ids))

    all_questions = q.order_by(Question.topic_id, Question.difficulty).all()

    # Group by (topic_id, difficulty) and take up to QUESTIONS_PER_TOPIC
    from collections import defaultdict
    bucket: dict[tuple[int, str], list[int]] = defaultdict(list)
    for question in all_questions:
        bucket[(question.topic_id, question.difficulty)].append(question.id)

    selected: list[int] = []
    for _, ids in sorted(bucket.items()):
        selected.extend(ids[:QUESTIONS_PER_TOPIC])

    return selected


# ---------------------------------------------------------------------------
# Answer scoring
# ---------------------------------------------------------------------------

def score_answer(
    db: Session,
    learner_id: int,
    session_id: str,
    question_id: int,
    selected_option_id: int | None,
    response_time_ms: int | None,
    help_requested: bool,
    skipped: bool,
) -> AssessmentAttempt:
    """
    Validate the submitted option, record the attempt, and update mastery.

    Raises ValueError for invalid question_id or option not belonging to question.
    Never trusts the learner_id from the request body — always uses the
    authenticated user's ID passed in from the router.
    """
    # Validate question exists and is active
    question = db.get(Question, question_id)
    if question is None or not question.is_active:
        raise ValueError(f"Question {question_id} does not exist or is inactive.")

    # Validate option belongs to this question (prevents cross-question cheating)
    is_correct: bool | None = None
    if not skipped and selected_option_id is not None:
        option = db.get(QuestionOption, selected_option_id)
        if option is None or option.question_id != question_id:
            raise ValueError(
                f"Option {selected_option_id} does not belong to question {question_id}."
            )
        is_correct = option.is_correct

    # Check for existing attempt in this session for this question
    existing = (
        db.query(AssessmentAttempt)
        .filter_by(
            learner_id=learner_id,
            session_id=session_id,
            question_id=question_id,
        )
        .first()
    )

    if existing is not None:
        # Increment attempt count for retry within same session
        existing.attempts_count += 1
        existing.selected_option_id = selected_option_id
        existing.is_correct = is_correct
        existing.response_time_ms = response_time_ms
        existing.help_requested = help_requested or existing.help_requested
        existing.skipped = skipped
        existing.attempted_at = datetime.now(timezone.utc)
        attempt = existing
    else:
        attempt = AssessmentAttempt(
            learner_id=learner_id,
            question_id=question_id,
            session_id=session_id,
            selected_option_id=selected_option_id,
            is_correct=is_correct,
            attempts_count=1,
            response_time_ms=response_time_ms,
            help_requested=help_requested,
            skipped=skipped,
        )
        db.add(attempt)

    db.flush()

    # Update concept mastery (baseline formula — Member 3 will replace this)
    if not skipped and is_correct is not None:
        _update_mastery(db, learner_id, question.topic_id, is_correct)

    db.commit()
    db.refresh(attempt)
    return attempt


# ---------------------------------------------------------------------------
# Mastery update (baseline formula)
# ---------------------------------------------------------------------------

def _update_mastery(
    db: Session,
    learner_id: int,
    topic_id: int,
    is_correct: bool,
) -> ConceptMastery:
    """
    Retrieve or create the mastery record and apply the baseline delta.

    Formula:
      correct : new_score = min(old + MASTERY_GAIN_CORRECT, 1.0)
      wrong   : new_score = max(old - MASTERY_LOSS_WRONG,   0.0)

    Uses filter_by + first() rather than get() to handle the missing
    UniqueConstraint gracefully — takes the first record if duplicates exist.
    """
    mastery = (
        db.query(ConceptMastery)
        .filter_by(learner_id=learner_id, topic_id=topic_id)
        .first()
    )

    if mastery is None:
        mastery = ConceptMastery(
            learner_id=learner_id,
            topic_id=topic_id,
            mastery_score=0.0,
        )
        db.add(mastery)
        db.flush()

    if is_correct:
        mastery.mastery_score = min(mastery.mastery_score + MASTERY_GAIN_CORRECT, 1.0)
    else:
        mastery.mastery_score = max(mastery.mastery_score - MASTERY_LOSS_WRONG, 0.0)

    mastery.last_updated = datetime.now(timezone.utc)
    return mastery


# ---------------------------------------------------------------------------
# Session results
# ---------------------------------------------------------------------------

def compute_session_results(db: Session, learner_id: int, session_id: str) -> dict:
    """
    Aggregate all attempts for this session and return summary statistics.
    Also returns per-topic mastery scores from the concept_mastery table.
    """
    attempts = (
        db.query(AssessmentAttempt)
        .filter_by(learner_id=learner_id, session_id=session_id)
        .all()
    )

    if not attempts:
        return {
            "total": 0, "answered": 0, "correct": 0,
            "skipped": 0, "score_percent": 0.0, "topic_breakdown": [],
        }

    total = len(attempts)
    skipped_count = sum(1 for a in attempts if a.skipped)
    answered = total - skipped_count
    correct = sum(1 for a in attempts if a.is_correct)
    score_percent = round((correct / total) * 100, 1) if total > 0 else 0.0

    # Per-topic breakdown
    topic_stats: dict[int, dict] = {}
    for attempt in attempts:
        question = db.get(Question, attempt.question_id)
        if question is None:
            continue
        tid = question.topic_id
        if tid not in topic_stats:
            topic = db.get(Topic, tid)
            mastery_row = (
                db.query(ConceptMastery)
                .filter_by(learner_id=learner_id, topic_id=tid)
                .first()
            )
            topic_stats[tid] = {
                "topic_id": tid,
                "topic_name": topic.name if topic else str(tid),
                "mastery_score": round(mastery_row.mastery_score, 3) if mastery_row else 0.0,
                "correct": 0,
                "total": 0,
            }
        topic_stats[tid]["total"] += 1
        if attempt.is_correct:
            topic_stats[tid]["correct"] += 1

    return {
        "total": total,
        "answered": answered,
        "correct": correct,
        "skipped": skipped_count,
        "score_percent": score_percent,
        "topic_breakdown": list(topic_stats.values()),
    }


# ---------------------------------------------------------------------------
# Helper: get explanation for a question
# ---------------------------------------------------------------------------

def get_explanation(db: Session, question_id: int, lang: str = "en") -> str | None:
    row = (
        db.query(QuestionI18n)
        .filter_by(question_id=question_id, language_code=lang)
        .first()
    )
    return row.explanation if row else None


# ---------------------------------------------------------------------------
# Helper: get correct option id for a question
# ---------------------------------------------------------------------------

def get_correct_option_id(db: Session, question_id: int) -> int | None:
    opt = (
        db.query(QuestionOption)
        .filter_by(question_id=question_id, is_correct=True)
        .first()
    )
    return opt.id if opt else None

"""
app/routers/assessment.py — Assessment endpoints.

GET  /assessment/subjects                  — list all subjects with their topics
POST /assessment/start                     — begin a new session, get question IDs
GET  /assessment/question/{question_id}   — fetch one question + options (no is_correct)
POST /assessment/answer                    — submit an answer, get result + explanation
GET  /assessment/result/{session_id}      — fetch full session summary + mastery

Design notes:
  - All endpoints require an authenticated learner (HttpOnly JWT cookie).
  - learner_id is ALWAYS taken from the authenticated user — never from the request body.
  - is_correct on options is NEVER returned before the learner submits.
  - The explanation is revealed only in the SubmitAnswerResponse (after submission).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_learner
from app.models import AssessmentAttempt, Question, QuestionOption, Subject, Topic, User
from app.schemas.assessment import (
    OptionOut,
    QuestionOut,
    SessionResultResponse,
    StartAssessmentRequest,
    StartAssessmentResponse,
    SubjectOut,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    TopicMasteryOut,
    TopicOut,
)
from app.services.assessment_service import (
    compute_session_results,
    get_correct_option_id,
    get_explanation,
    score_answer,
    select_questions,
)

router = APIRouter(prefix="/assessment", tags=["assessment"])


# ---------------------------------------------------------------------------
# GET /assessment/subjects
# ---------------------------------------------------------------------------
@router.get(
    "/subjects",
    response_model=list[SubjectOut],
    summary="List all subjects and their topics",
)
def list_subjects(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_learner),
) -> list[SubjectOut]:
    """
    Return all active subjects with their associated topics.
    Used by the frontend to populate the subject/topic selector before
    the learner starts an assessment.
    """
    subjects = db.query(Subject).order_by(Subject.id).all()

    result: list[SubjectOut] = []
    for subject in subjects:
        topics = (
            db.query(Topic)
            .filter(Topic.subject_id == subject.id)
            .order_by(Topic.order_index)
            .all()
        )
        result.append(
            SubjectOut(
                id=subject.id,
                name=subject.name,
                code=subject.code,
                topics=[
                    TopicOut(id=t.id, name=t.name, order_index=t.order_index)
                    for t in topics
                ],
            )
        )

    return result


# ---------------------------------------------------------------------------
# POST /assessment/start
# ---------------------------------------------------------------------------
@router.post(
    "/start",
    response_model=StartAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new assessment session",
)
def start_assessment(
    body: StartAssessmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learner),
) -> StartAssessmentResponse:
    """
    Validate the session_id and select questions for this session.

    - The client generates a UUID v4 session_id and passes it here.
    - The same session_id must be included with every subsequent answer.
    - Returns the ordered list of question_ids for this session.
    - Returns 409 if the session_id has already been used by this learner.
    """
    # Check that the session_id has not already been used by this learner
    existing = (
        db.query(AssessmentAttempt)
        .filter_by(learner_id=current_user.id, session_id=body.session_id)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Session '{body.session_id}' already has recorded attempts. "
                "Use a new UUID to start a fresh session."
            ),
        )

    question_ids = select_questions(db, body.subject_id, body.topic_id)

    if not question_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active questions found for the selected subject/topic.",
        )

    return StartAssessmentResponse(
        session_id=body.session_id,
        total_questions=len(question_ids),
        question_ids=question_ids,
        message=(
            f"Session started. {len(question_ids)} question(s) selected. "
            "Use GET /assessment/question/{{id}} to fetch each question."
        ),
    )


# ---------------------------------------------------------------------------
# GET /assessment/question/{question_id}
# ---------------------------------------------------------------------------
@router.get(
    "/question/{question_id}",
    response_model=QuestionOut,
    summary="Fetch a single question with its answer options",
)
def get_question(
    question_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_learner),
) -> QuestionOut:
    """
    Return a question and its answer options.

    IMPORTANT: is_correct is deliberately excluded from the response.
    The correct answer is only revealed in the SubmitAnswerResponse
    after the learner has submitted their choice.
    """
    question = db.get(Question, question_id)

    if question is None or not question.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Question {question_id} not found.",
        )

    # Fetch options — is_correct is intentionally NOT included in OptionOut
    options = (
        db.query(QuestionOption)
        .filter(QuestionOption.question_id == question_id)
        .order_by(QuestionOption.id)
        .all()
    )

    topic = db.get(Topic, question.topic_id)
    topic_name = topic.name if topic else str(question.topic_id)

    return QuestionOut(
        id=question.id,
        question_text=question.question_text,
        question_type=question.question_type,
        difficulty=question.difficulty,
        topic_id=question.topic_id,
        topic_name=topic_name,
        options=[OptionOut(id=o.id, option_text=o.option_text) for o in options],
        explanation=None,   # explanation revealed only after submission
    )


# ---------------------------------------------------------------------------
# POST /assessment/answer
# ---------------------------------------------------------------------------
@router.post(
    "/answer",
    response_model=SubmitAnswerResponse,
    summary="Submit an answer for a question",
)
def submit_answer(
    body: SubmitAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learner),
) -> SubmitAnswerResponse:
    """
    Score the submitted answer, update concept mastery, and return the result.

    - learner_id comes from the authenticated cookie — never the request body.
    - Returns is_correct and the correct_option_id AFTER submission.
    - Returns the explanation text (read aloud by TTS in the frontend).
    - Returns 400 for invalid question_id or mismatched option.
    """
    try:
        attempt = score_answer(
            db=db,
            learner_id=current_user.id,
            session_id=body.session_id,
            question_id=body.question_id,
            selected_option_id=body.selected_option_id,
            response_time_ms=body.response_time_ms,
            help_requested=body.help_requested,
            skipped=body.skipped,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    correct_option_id = get_correct_option_id(db, body.question_id)
    explanation = get_explanation(db, body.question_id, lang="en")

    return SubmitAnswerResponse(
        attempt_id=attempt.id,
        question_id=body.question_id,
        is_correct=attempt.is_correct,
        skipped=attempt.skipped,
        correct_option_id=correct_option_id,
        explanation=explanation,
    )


# ---------------------------------------------------------------------------
# GET /assessment/result/{session_id}
# ---------------------------------------------------------------------------
@router.get(
    "/result/{session_id}",
    response_model=SessionResultResponse,
    summary="Fetch the summary and mastery scores for a completed session",
)
def get_session_result(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learner),
) -> SessionResultResponse:
    """
    Return overall statistics and per-topic mastery scores for the session.

    - Only the learner who owns the session can fetch its results.
    - Returns 404 if the session_id has no recorded attempts for this learner.
    """
    stats = compute_session_results(db, current_user.id, session_id)

    if stats["total"] == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No attempts found for session '{session_id}'. "
                "Complete at least one question before fetching results."
            ),
        )

    topic_breakdown = [TopicMasteryOut(**t) for t in stats["topic_breakdown"]]

    return SessionResultResponse(
        session_id=session_id,
        total_questions=stats["total"],
        answered=stats["answered"],
        correct=stats["correct"],
        skipped=stats["skipped"],
        score_percent=stats["score_percent"],
        topic_breakdown=topic_breakdown,
        message=(
            f"Session complete. You answered {stats['answered']} of {stats['total']} "
            f"question(s) and scored {stats['score_percent']}%."
        ),
    )

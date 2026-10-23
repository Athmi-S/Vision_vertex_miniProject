/**
 * useAssessment.ts — Hook for the full diagnostic assessment flow.
 *
 * Mirrors the five backend assessment endpoints exactly:
 *   GET  /assessment/subjects             → loadSubjects()
 *   POST /assessment/start                → startSession()
 *   GET  /assessment/question/{id}        → loadQuestion()  [called internally]
 *   POST /assessment/answer               → submitAnswer()
 *   GET  /assessment/result/{session_id}  → loadResult()
 *
 * State machine (simplified):
 *   idle → loading_subjects → selecting → starting → in_question →
 *   submitting → feedback → (next question or) finished → loading_result → done
 *
 * The hook never stores the JWT — credentials:"include" sends the
 * HttpOnly cookie automatically on every request.
 */

import { useState, useCallback } from "react";

const API = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types that match the backend schemas exactly
// ---------------------------------------------------------------------------

export interface TopicOut {
  id: number;
  name: string;
  order_index: number;
}

export interface SubjectOut {
  id: number;
  name: string;
  code: string;
  topics: TopicOut[];
}

export interface OptionOut {
  id: number;
  option_text: string;
}

export interface QuestionOut {
  id: number;
  question_text: string;
  question_type: string;
  difficulty: string;
  topic_id: number;
  topic_name: string;
  options: OptionOut[];
  explanation: string | null; // null before submission
}

export interface AnswerResult {
  attempt_id: number;
  question_id: number;
  is_correct: boolean | null;
  skipped: boolean;
  correct_option_id: number | null;
  explanation: string | null;
}

export interface TopicMastery {
  topic_id: number;
  topic_name: string;
  mastery_score: number;
  correct: number;
  total: number;
}

export interface SessionResult {
  session_id: string;
  total_questions: number;
  answered: number;
  correct: number;
  skipped: number;
  score_percent: number;
  topic_breakdown: TopicMastery[];
  message: string;
}

// ---------------------------------------------------------------------------
// Hook state
// ---------------------------------------------------------------------------

export type AssessmentPhase =
  | "idle"            // not yet started
  | "loading"         // any network request in flight
  | "selecting"       // learner is choosing subject/topic
  | "in_question"     // question displayed, awaiting learner choice
  | "submitting"      // POST /answer in flight
  | "feedback"        // answer submitted, showing result + explanation
  | "finished"        // all questions answered, ready to view results
  | "loading_result"  // GET /result in flight
  | "done";           // results loaded and shown

export interface UseAssessmentReturn {
  // Data
  subjects: SubjectOut[];
  sessionId: string | null;
  questionIds: number[];
  currentIndex: number;           // 0-based index into questionIds
  currentQuestion: QuestionOut | null;
  lastAnswerResult: AnswerResult | null;
  sessionResult: SessionResult | null;

  // Phase / UI state
  phase: AssessmentPhase;
  error: string;

  // Actions
  loadSubjects: () => Promise<void>;
  startSession: (subjectId: number | null, topicId: number | null) => Promise<void>;
  submitAnswer: (selectedOptionId: number | null, skipped: boolean) => Promise<void>;
  nextQuestion: () => Promise<void>;
  loadResult: () => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helper: generate a UUID v4 (no external library needed)
// ---------------------------------------------------------------------------
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAssessment(): UseAssessmentReturn {
  const [subjects, setSubjects] = useState<SubjectOut[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionIds, setQuestionIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionOut | null>(null);
  const [lastAnswerResult, setLastAnswerResult] = useState<AnswerResult | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [phase, setPhase] = useState<AssessmentPhase>("idle");
  const [error, setError] = useState("");

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Centralised 401 sentinel — caller pages redirect to /login on this. */
  function handleHttpError(status: number, detail: string): never {
    if (status === 401) throw new Error("NOT_AUTHENTICATED");
    throw new Error(detail || `Request failed (${status}).`);
  }

  const fetchQuestion = useCallback(async (questionId: number): Promise<QuestionOut> => {
    const r = await fetch(`${API}/assessment/question/${questionId}`, {
      credentials: "include",
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      handleHttpError(r.status, body.detail ?? "");
    }
    return r.json();
  }, []);

  // -------------------------------------------------------------------------
  // loadSubjects — GET /assessment/subjects
  // -------------------------------------------------------------------------
  const loadSubjects = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const r = await fetch(`${API}/assessment/subjects`, {
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        handleHttpError(r.status, body.detail ?? "");
      }
      const data: SubjectOut[] = await r.json();
      setSubjects(data);
      setPhase("selecting");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load subjects.");
      setPhase("idle");
    }
  }, []);

  // -------------------------------------------------------------------------
  // startSession — POST /assessment/start
  // -------------------------------------------------------------------------
  const startSession = useCallback(
    async (subjectId: number | null, topicId: number | null) => {
      setPhase("loading");
      setError("");
      const newSessionId = generateUUID();
      try {
        const r = await fetch(`${API}/assessment/start`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: newSessionId,
            subject_id: subjectId,
            topic_id: topicId,
          }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          handleHttpError(r.status, body.detail ?? "");
        }
        const data: { session_id: string; total_questions: number; question_ids: number[]; message: string } =
          await r.json();

        setSessionId(data.session_id);
        setQuestionIds(data.question_ids);
        setCurrentIndex(0);
        setLastAnswerResult(null);
        setSessionResult(null);

        // Fetch the first question
        const q = await fetchQuestion(data.question_ids[0]);
        setCurrentQuestion(q);
        setPhase("in_question");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not start session."
        );
        setPhase("selecting");
      }
    },
    [fetchQuestion]
  );

  // -------------------------------------------------------------------------
  // submitAnswer — POST /assessment/answer
  // -------------------------------------------------------------------------
  const submitAnswer = useCallback(
    async (selectedOptionId: number | null, skipped: boolean) => {
      if (!sessionId || !currentQuestion) return;
      setPhase("submitting");
      setError("");

      // Record when the question was shown so response_time_ms can be sent
      // We approximate it: for now we send null (optional field).
      try {
        const r = await fetch(`${API}/assessment/answer`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            question_id: currentQuestion.id,
            selected_option_id: selectedOptionId,
            skipped,
            help_requested: false,
          }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          handleHttpError(r.status, body.detail ?? "");
        }
        const result: AnswerResult = await r.json();
        setLastAnswerResult(result);
        setPhase("feedback");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not submit answer."
        );
        setPhase("in_question");
      }
    },
    [sessionId, currentQuestion]
  );

  // -------------------------------------------------------------------------
  // nextQuestion — advance to the next question or move to finished
  // -------------------------------------------------------------------------
  const nextQuestion = useCallback(async () => {
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questionIds.length) {
      // All questions answered
      setPhase("finished");
      setCurrentQuestion(null);
      return;
    }

    setPhase("loading");
    setError("");
    try {
      const q = await fetchQuestion(questionIds[nextIndex]);
      setCurrentQuestion(q);
      setCurrentIndex(nextIndex);
      setLastAnswerResult(null);
      setPhase("in_question");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not load next question."
      );
      setPhase("finished");
    }
  }, [currentIndex, questionIds, fetchQuestion]);

  // -------------------------------------------------------------------------
  // loadResult — GET /assessment/result/{session_id}
  // -------------------------------------------------------------------------
  const loadResult = useCallback(async () => {
    if (!sessionId) return;
    setPhase("loading_result");
    setError("");
    try {
      const r = await fetch(`${API}/assessment/result/${sessionId}`, {
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        handleHttpError(r.status, body.detail ?? "");
      }
      const data: SessionResult = await r.json();
      setSessionResult(data);
      setPhase("done");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not load results."
      );
      setPhase("finished");
    }
  }, [sessionId]);

  // -------------------------------------------------------------------------
  // reset — return to idle so a new session can be started
  // -------------------------------------------------------------------------
  const reset = useCallback(() => {
    setSubjects([]);
    setSessionId(null);
    setQuestionIds([]);
    setCurrentIndex(0);
    setCurrentQuestion(null);
    setLastAnswerResult(null);
    setSessionResult(null);
    setPhase("idle");
    setError("");
  }, []);

  return {
    subjects,
    sessionId,
    questionIds,
    currentIndex,
    currentQuestion,
    lastAnswerResult,
    sessionResult,
    phase,
    error,
    loadSubjects,
    startSession,
    submitAnswer,
    nextQuestion,
    loadResult,
    reset,
  };
}

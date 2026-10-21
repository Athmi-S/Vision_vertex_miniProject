/**
 * DiagnosticPage.tsx — Full diagnostic assessment flow.
 *
 * Phases rendered (driven by useAssessment.phase):
 *   idle         → triggers loadSubjects() on mount
 *   loading      → spinner / status message
 *   selecting    → subject + topic dropdowns, Start button
 *   in_question  → question text, option radio cards, Submit + Skip
 *   submitting   → options disabled, spinner
 *   feedback     → correct/wrong/skipped banner, explanation, Next button
 *   finished     → "View Results" button
 *   loading_result → spinner while fetching summary
 *   done         → navigates to /result/:sessionId
 *
 * Auth guard: redirects to /login on 401 from any API call.
 * Mode guard: if learning_mode is null, shows a prompt to pick a mode first.
 *
 * Accessibility:
 *  - One visible question at a time with a clear heading
 *  - Radio-card options (keyboard: arrow keys between options)
 *  - role="alert" on error banners; role="status" on progress + feedback
 *  - aria-busy on disabled buttons during network requests
 *  - Skip link and landmark regions
 */

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { useAssessment } from "../hooks/useAssessment";
import type { SubjectOut } from "../hooks/useAssessment";
import { useTTS } from "../hooks/useTTS";
import TTSToolbar from "../components/TTSToolbar";
import "./DiagnosticPage.css";

// ---------------------------------------------------------------------------
// Shared sub-components (same header/footer pattern as all other pages)
// ---------------------------------------------------------------------------

function PageHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="site-header" role="banner">
      <nav
        aria-label="Site navigation"
        className="site-nav"
        style={{ justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="site-logo" aria-hidden="true">🎓</span>
          <span className="site-name">VISION Learning</span>
        </div>
        <button
          onClick={onLogout}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.4)",
            color: "#fff",
            borderRadius: "4px",
            padding: "0.3rem 0.9rem",
            cursor: "pointer",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
          aria-label="Log out of VISION"
        >
          Log out
        </button>
      </nav>
    </header>
  );
}

function PageFooter() {
  return (
    <footer className="site-footer" role="contentinfo">
      <p>VISION — Third-Year AIML Engineering Project &nbsp;|&nbsp; 4SF24CI033</p>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function DiagnosticPage() {
  const navigate = useNavigate();

  // Auth
  const { user, loading: authLoading } = useAuth();

  // Profile (needed for mode guard)
  const {
    profile,
    loading: profileLoading,
    fetchProfile,
  } = useProfile();

  // Assessment state machine
  const {
    subjects,
    sessionId,
    questionIds,
    currentIndex,
    currentQuestion,
    lastAnswerResult,
    phase,
    error,
    loadSubjects,
    startSession,
    submitAnswer,
    nextQuestion,
    loadResult,
    reset,
  } = useAssessment();

  // TTS — use the learner's saved language preference
  const languagePref = profile?.language_pref ?? "en";
  const {
    supported: ttsSupported,
    speaking,
    isFallbackVoice,
    voiceName,
    speak,
    stop: stopSpeech,
  } = useTTS(languagePref);

  // Learner's current selection in the subject/topic dropdowns
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "">("");
  const [selectedTopicId, setSelectedTopicId] = useState<number | "">("");

  // Which option the learner clicked before submitting
  const [pickedOptionId, setPickedOptionId] = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && user === null) {
      navigate("/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // -------------------------------------------------------------------------
  // Load profile (for mode guard) then load subjects
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && user !== null) {
      fetchProfile();
    }
  }, [authLoading, user, fetchProfile]);

  // Load subjects once profile is ready, and again whenever the assessment
  // is reset back to "idle" (e.g. after "Try Again").
  useEffect(() => {
    if (!profileLoading && profile !== null && phase === "idle") {
      loadSubjects();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, profile?.learning_mode, phase]);

  // -------------------------------------------------------------------------
  // Handle 401 sentinel from the assessment hook
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (error === "NOT_AUTHENTICATED") {
      navigate("/login", { replace: true });
    }
  }, [error, navigate]);

  // -------------------------------------------------------------------------
  // Navigate to results page when done
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "done" && sessionId) {
      navigate(`/result/${sessionId}`);
    }
  }, [phase, sessionId, navigate]);

  // -------------------------------------------------------------------------
  // Reset picked option when moving to a new question
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "in_question") {
      setPickedOptionId(null);
    }
  }, [phase, currentQuestion?.id]);

  // -------------------------------------------------------------------------
  // Auto-announce: read new question aloud as soon as it appears.
  // This lets visually impaired learners hear the question immediately
  // without needing to find and click the "Read Question" button.
  // A short delay gives the browser time to render before speaking.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "in_question" && currentQuestion && ttsSupported) {
      const optionLines = currentQuestion.options
        .map((o, i) => `Option ${i + 1}: ${o.option_text}`)
        .join(". ");
      const text =
        `Question ${currentIndex + 1} of ${questionIds.length}. ` +
        `${currentQuestion.question_text}. ` +
        `${optionLines}. ` +
        `Press Tab to navigate options, then Tab to Submit Answer or Skip.`;

      // Small delay so the DOM has settled before speechSynthesis fires
      const timer = setTimeout(() => speak(text), 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, phase]);

  // -------------------------------------------------------------------------
  // Auto-announce: read feedback aloud as soon as the backend returns it.
  // The explanation is only spoken AFTER the API has accepted the answer —
  // never before submission.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "feedback" && lastAnswerResult && ttsSupported) {
      const outcome = lastAnswerResult.skipped
        ? "You skipped this question."
        : lastAnswerResult.is_correct
        ? "Correct!"
        : "Incorrect.";
      const explanation = lastAnswerResult.explanation
        ? ` Explanation: ${lastAnswerResult.explanation}`
        : "";
      const nav =
        currentIndex + 1 < questionIds.length
          ? " Press Tab to go to the Next Question."
          : " Press Tab to Finish Assessment.";

      const timer = setTimeout(() => speak(`${outcome}${explanation}${nav}`), 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lastAnswerResult?.attempt_id]);

  // -------------------------------------------------------------------------
  // Stop speech when leaving the question/feedback phases entirely
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "in_question" && phase !== "feedback" && phase !== "submitting") {
      stopSpeech();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------
  const totalQuestions = questionIds.length;
  const progressPercent =
    totalQuestions > 0 ? ((currentIndex) / totalQuestions) * 100 : 0;

  const currentSubject: SubjectOut | undefined = subjects.find(
    (s) => s.id === selectedSubjectId
  );
  const availableTopics = currentSubject?.topics ?? [];

  const displayError =
    error && error !== "NOT_AUTHENTICATED" ? error : "";

  // -------------------------------------------------------------------------
  // TTS handlers
  // -------------------------------------------------------------------------

  /**
   * Build the full "question + options" speech string.
   * Format: "<question text>. Option 1: <text>. Option 2: <text>. …"
   * This gives keyboard and screen-reader users a complete audio scan
   * of the question without needing to navigate each option individually.
   */
  function buildQuestionSpeech(): string {
    if (!currentQuestion) return "";
    const optionLines = currentQuestion.options
      .map((o, i) => `Option ${i + 1}: ${o.option_text}`)
      .join(". ");
    return `${currentQuestion.question_text}. ${optionLines}`;
  }

  /**
   * Build the feedback speech string.
   * Only called after the backend has returned the answer result —
   * the explanation field is guaranteed to be from the API response.
   */
  function buildFeedbackSpeech(): string {
    if (!lastAnswerResult) return "";
    const outcome = lastAnswerResult.skipped
      ? "You skipped this question."
      : lastAnswerResult.is_correct
      ? "Correct!"
      : "Incorrect.";
    const explanation = lastAnswerResult.explanation
      ? ` Explanation: ${lastAnswerResult.explanation}`
      : "";
    return `${outcome}${explanation}`;
  }

  function handleTTSReadQuestion() {
    speak(buildQuestionSpeech());
  }

  function handleTTSReadFeedback() {
    speak(buildFeedbackSpeech());
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  function handleSubjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSelectedSubjectId(val === "" ? "" : Number(val));
    setSelectedTopicId(""); // clear topic when subject changes
  }

  function handleTopicChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSelectedTopicId(val === "" ? "" : Number(val));
  }

  async function handleStart() {
    const subjectId = selectedSubjectId === "" ? null : selectedSubjectId;
    const topicId = selectedTopicId === "" ? null : selectedTopicId;
    await startSession(subjectId, topicId);
  }

  async function handleSubmit() {
    if (pickedOptionId === null) return;
    await submitAnswer(pickedOptionId, false);
  }

  async function handleSkip() {
    await submitAnswer(null, true);
  }

  async function handleNext() {
    await nextQuestion();
  }

  async function handleViewResults() {
    await loadResult();
  }

  async function handleLogout() {
    await fetch("http://localhost:8000/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/", { replace: true });
  }

  // -------------------------------------------------------------------------
  // Render: waiting for auth session check
  // -------------------------------------------------------------------------
  if (authLoading || profileLoading) {
    return (
      <div className="diag-page">
        <PageHeader onLogout={handleLogout} />
        <main className="diag-main" tabIndex={-1}>
          <div className="diag-card">
            <p className="diag-loading-text" aria-live="polite">
              Loading…
            </p>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  if (!user) return null; // redirecting

  // -------------------------------------------------------------------------
  // Render: mode guard
  // -------------------------------------------------------------------------
  if (profile !== null && profile.learning_mode === null) {
    return (
      <div className="diag-page">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <PageHeader onLogout={handleLogout} />
        <main id="main-content" className="diag-main" tabIndex={-1}>
          <div className="diag-card">
            <h1 className="diag-title">Choose a Learning Mode First</h1>
            <p className="diag-subtitle">
              Before starting an assessment, please choose how you would like
              to use VISION.
            </p>
            <div className="diag-btn-row">
              <Link to="/mode-select" className="diag-btn-primary"
                style={{ textDecoration: "none", display: "inline-block" }}>
                Choose Learning Mode
              </Link>
              <Link to="/dashboard" className="diag-btn-secondary"
                style={{ textDecoration: "none", display: "inline-block" }}>
                Back to Dashboard
              </Link>
            </div>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: main content (all assessment phases)
  // -------------------------------------------------------------------------
  return (
    <div className="diag-page">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <PageHeader onLogout={handleLogout} />

      <main id="main-content" className="diag-main" tabIndex={-1}>
        <div className="diag-card">

          {/* ---- Error banner ---- */}
          {displayError && (
            <p className="diag-error-banner" role="alert">
              {displayError}
            </p>
          )}

          {/* ================================================================
              PHASE: loading (generic spinner for subject load / session start)
              ================================================================ */}
          {(phase === "idle" || phase === "loading") && !displayError && (
            <>
              <h1 className="diag-title">Diagnostic Assessment</h1>
              <p
                className="diag-loading-text"
                aria-live="polite"
                aria-busy="true"
              >
                Loading…
              </p>
            </>
          )}

          {/* ================================================================
              PHASE: selecting — subject/topic dropdowns
              ================================================================ */}
          {phase === "selecting" && (
            <>
              <h1 className="diag-title">Start a Diagnostic Assessment</h1>
              <p className="diag-subtitle">
                Choose a subject and optional topic, then click Start. Leave
                the dropdowns on "All" for a full cross-subject diagnostic.
              </p>

              <form
                className="diag-form"
                onSubmit={(e) => { e.preventDefault(); handleStart(); }}
                aria-label="Assessment setup form"
              >
                {/* Subject selector */}
                <div className="diag-form-group">
                  <label className="diag-label" htmlFor="diag-subject">
                    Subject
                  </label>
                  <select
                    id="diag-subject"
                    className="diag-select"
                    value={selectedSubjectId}
                    onChange={handleSubjectChange}
                  >
                    <option value="">All subjects</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Topic selector — only shown when a subject is picked */}
                {selectedSubjectId !== "" && availableTopics.length > 0 && (
                  <div className="diag-form-group">
                    <label className="diag-label" htmlFor="diag-topic">
                      Topic
                    </label>
                    <select
                      id="diag-topic"
                      className="diag-select"
                      value={selectedTopicId}
                      onChange={handleTopicChange}
                    >
                      <option value="">All topics in this subject</option>
                      {availableTopics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {subjects.length === 0 && (
                  <p className="diag-info-banner" role="status">
                    No subjects are available yet. Please check back later or
                    contact your administrator.
                  </p>
                )}

                <div className="diag-btn-row">
                  <button
                    type="submit"
                    className="diag-btn-primary"
                    disabled={subjects.length === 0}
                    aria-busy={false}
                  >
                    Start Assessment
                  </button>
                  <Link
                    to="/dashboard"
                    className="diag-btn-secondary"
                    style={{ textDecoration: "none", display: "inline-flex",
                      alignItems: "center" }}
                  >
                    Back to Dashboard
                  </Link>
                </div>
              </form>
            </>
          )}

          {/* ================================================================
              PHASE: in_question / submitting / feedback
              ================================================================ */}
          {(phase === "in_question" ||
            phase === "submitting" ||
            phase === "feedback") &&
            currentQuestion && (
            <>
              <h1 className="diag-title">Diagnostic Assessment</h1>

              {/* Progress */}
              <div
                className="diag-progress-area"
                role="status"
                aria-label={`Question ${currentIndex + 1} of ${totalQuestions}`}
              >
                <p className="diag-progress-label">
                  Question {currentIndex + 1} of {totalQuestions}
                </p>
                <div className="diag-progress-bar-track" aria-hidden="true">
                  <div
                    className="diag-progress-bar-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Topic + difficulty badges */}
              <div className="diag-question-meta" aria-hidden="true">
                <span className="diag-badge">{currentQuestion.topic_name}</span>
                <span className="diag-badge">{currentQuestion.difficulty}</span>
              </div>

              {/* Question text */}
              <p className="diag-question-text" id="question-text">
                {currentQuestion.question_text}
              </p>

              {/* ---- Outcome banner (feedback phase only) ---- */}
              {phase === "feedback" && lastAnswerResult && (
                <div
                  className={`diag-outcome ${
                    lastAnswerResult.skipped
                      ? "skipped"
                      : lastAnswerResult.is_correct
                      ? "correct"
                      : "wrong"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {lastAnswerResult.skipped
                    ? "Skipped"
                    : lastAnswerResult.is_correct
                    ? "Correct!"
                    : "Incorrect"}
                </div>
              )}

              {/* ---- Explanation (feedback phase only) ---- */}
              {phase === "feedback" &&
                lastAnswerResult?.explanation && (
                  <div className="diag-explanation" aria-live="polite">
                    <strong>Explanation</strong>
                    {lastAnswerResult.explanation}
                  </div>
                )}

              {/* ---- Answer options ---- */}
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend style={{
                  position: "absolute", width: "1px", height: "1px",
                  padding: 0, margin: "-1px", overflow: "hidden",
                  clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
                }}>Answer options</legend>
                <div
                  className="diag-options"
                  role="radiogroup"
                  aria-labelledby="question-text"
                >
                  {currentQuestion.options.map((opt) => {
                    const isSubmitted =
                      phase === "feedback" || phase === "submitting";
                    const isPicked = pickedOptionId === opt.id;
                    const isCorrectOpt =
                      lastAnswerResult?.correct_option_id === opt.id;
                    const isWrongPick =
                      isPicked && lastAnswerResult?.is_correct === false;

                    // After submission, mark correct/wrong options
                    let labelClass = "diag-option-label";
                    if (isSubmitted && isCorrectOpt) {
                      labelClass += " correct";
                    } else if (isSubmitted && isWrongPick) {
                      labelClass += " wrong";
                    } else if (!isSubmitted && isPicked) {
                      labelClass += " selected";
                    }

                    return (
                      <label
                        key={opt.id}
                        className={labelClass}
                        aria-label={
                          isSubmitted && isCorrectOpt
                            ? `${opt.option_text} (correct answer)`
                            : isSubmitted && isWrongPick
                            ? `${opt.option_text} (your answer — incorrect)`
                            : opt.option_text
                        }
                      >
                        <input
                          type="radio"
                          name="answer-option"
                          value={opt.id}
                          checked={isPicked}
                          onChange={() => setPickedOptionId(opt.id)}
                          disabled={isSubmitted}
                          className="diag-option-radio"
                        />
                        <span className="diag-option-text">
                          {opt.option_text}
                        </span>
                        {isSubmitted && isCorrectOpt && (
                          <span
                            className="diag-option-suffix"
                            aria-hidden="true"
                          >
                            ✅
                          </span>
                        )}
                        {isSubmitted && isWrongPick && (
                          <span
                            className="diag-option-suffix"
                            aria-hidden="true"
                          >
                            ✗
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* ---- TTS toolbar (shown during in_question and feedback phases) ---- */}
              <TTSToolbar
                questionText={currentQuestion.question_text}
                feedbackText={
                  phase === "feedback" ? buildFeedbackSpeech() : null
                }
                speaking={speaking}
                supported={ttsSupported}
                isFallbackVoice={isFallbackVoice}
                voiceName={voiceName}
                onReadQuestion={handleTTSReadQuestion}
                onReadFeedback={handleTTSReadFeedback}
                onStop={stopSpeech}
              />

              {/* ---- Action buttons ---- */}
              <div className="diag-btn-row">
                {/* Submit (in_question phase) */}
                {phase === "in_question" && (
                  <>
                    <button
                      type="button"
                      className="diag-btn-primary"
                      onClick={handleSubmit}
                      disabled={pickedOptionId === null}
                      aria-disabled={pickedOptionId === null}
                    >
                      Submit Answer
                    </button>
                    <button
                      type="button"
                      className="diag-btn-secondary"
                      onClick={handleSkip}
                    >
                      Skip
                    </button>
                  </>
                )}

                {/* Submitting spinner */}
                {phase === "submitting" && (
                  <button
                    type="button"
                    className="diag-btn-primary"
                    disabled
                    aria-busy="true"
                  >
                    Submitting…
                  </button>
                )}

                {/* Next / Finish (feedback phase) */}
                {phase === "feedback" && (
                  <button
                    type="button"
                    className="diag-btn-primary"
                    onClick={handleNext}
                  >
                    {currentIndex + 1 < totalQuestions
                      ? "Next Question"
                      : "Finish Assessment"}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ================================================================
              PHASE: finished — all questions done, load results
              ================================================================ */}
          {phase === "finished" && (
            <>
              <h1 className="diag-title">Assessment Complete</h1>
              <p
                className="diag-subtitle"
                role="status"
                aria-live="polite"
              >
                You have answered all {totalQuestions} question(s). Click below
                to view your results and topic mastery scores.
              </p>
              <div className="diag-btn-row">
                <button
                  type="button"
                  className="diag-btn-primary"
                  onClick={handleViewResults}
                >
                  View Results
                </button>
                <button
                  type="button"
                  className="diag-btn-secondary"
                  onClick={() => { reset(); }}
                >
                  Try Again
                </button>
              </div>
            </>
          )}

          {/* ================================================================
              PHASE: loading_result
              ================================================================ */}
          {phase === "loading_result" && (
            <>
              <h1 className="diag-title">Loading Results…</h1>
              <p
                className="diag-loading-text"
                aria-live="polite"
                aria-busy="true"
              >
                Fetching your session summary…
              </p>
            </>
          )}

          {/* ---- Back link (visible in selecting phase) ---- */}
          {phase === "selecting" && (
            <div>
              <Link to="/dashboard" className="diag-back-link">
                ← Back to Dashboard
              </Link>
            </div>
          )}

        </div>
      </main>

      <PageFooter />
    </div>
  );
}

export default DiagnosticPage;

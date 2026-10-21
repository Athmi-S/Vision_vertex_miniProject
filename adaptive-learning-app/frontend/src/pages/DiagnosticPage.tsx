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

import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { useAssessment } from "../hooks/useAssessment";
import type { SubjectOut } from "../hooks/useAssessment";
import { useTTS } from "../hooks/useTTS";
import { useSTT, matchOptionFromTranscript } from "../hooks/useSTT";
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
      <p>VISION Adaptive Learning Platform</p>
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
    speakThen,
    stop: stopSpeech,
  } = useTTS(languagePref);

  // STT — speech-to-text for voice answer input
  const {
    supported: sttSupported,
    listening,
    transcript,
    sttError,
    startListening,
    stopListening,
  } = useSTT();

  // Learner's current selection in the subject/topic dropdowns
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "">("");
  const [selectedTopicId, setSelectedTopicId] = useState<number | "">("");

  // Which option the learner clicked before submitting
  const [pickedOptionId, setPickedOptionId] = useState<number | null>(null);

  /**
   * listeningMode controls what we do when STT returns a transcript.
   * We keep BOTH a state (for re-render) and a ref (for reading inside
   * stale-closure callbacks like useEffect([transcript])).
   *
   *   "answer"       — waiting for the learner to say an option number
   *   "confirm_next" — asked "shall we move to next?" and waiting for yes/no
   */
  const listeningModeRef = useRef<"answer" | "confirm_next">("answer");

  // Keep a ref of the current phase too, for the same stale-closure reason
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Keep refs of values used inside the transcript handler
  const currentQuestionRef = useRef(currentQuestion);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  const questionIdsRef = useRef(questionIds);
  useEffect(() => { questionIdsRef.current = questionIds; }, [questionIds]);

  /** Update the listening mode ref (no state needed — refs don't re-render) */
  function setMode(m: "answer" | "confirm_next") {
    listeningModeRef.current = m;
  }

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
  // -------------------------------------------------------------------------
  // Auto-announce question + AUTO-START listening when TTS finishes.
  // After TTS reads the question the microphone opens automatically —
  // the learner does not need to click anything.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "in_question" && currentQuestion) {
      setMode("answer");
      const optionLines = currentQuestion.options
        .map((o, i) => `Option ${i + 1}: ${o.option_text}`)
        .join(". ");
      const text =
        `Question ${currentIndex + 1} of ${questionIds.length}. ` +
        `${currentQuestion.question_text}. ` +
        `${optionLines}. ` +
        `Say your answer now.`;

      const timer = setTimeout(() => {
        if (ttsSupported && sttSupported) {
          // Speak, then auto-open mic when speech ends
          speakThen(text, () => {
            // Small gap before mic opens so TTS audio doesn't feed back
            setTimeout(() => startListening(), 400);
          });
        } else if (ttsSupported) {
          speak(text);
        } else if (sttSupported) {
          // No TTS — open mic immediately
          startListening();
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, phase]);

  // -------------------------------------------------------------------------
  // Auto-announce feedback, then ask "move to next?" and listen for yes/no.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "feedback" && lastAnswerResult) {
      setMode("confirm_next");
      const outcome = lastAnswerResult.skipped
        ? "You skipped this question."
        : lastAnswerResult.is_correct
        ? "Correct!"
        : "Incorrect.";
      const explanation = lastAnswerResult.explanation
        ? ` Explanation: ${lastAnswerResult.explanation}.`
        : "";
      const isLast = currentIndex + 1 >= questionIds.length;
      const prompt = isLast
        ? " Shall we finish the assessment? Say yes to view results, or no to stay."
        : " Shall we move to the next question? Say yes to continue, or no to stay.";

      const fullText = `${outcome}${explanation}${prompt}`;

      const timer = setTimeout(() => {
        if (ttsSupported && sttSupported) {
          speakThen(fullText, () => {
            setTimeout(() => startListening(), 400);
          });
        } else if (ttsSupported) {
          speak(fullText);
        } else if (sttSupported) {
          startListening();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lastAnswerResult?.attempt_id]);

  // -------------------------------------------------------------------------
  // STT transcript handler — two modes.
  // IMPORTANT: uses refs (phaseRef, listeningModeRef, etc.) NOT state values,
  // because this effect only re-runs when `transcript` changes.  State values
  // captured at effect-creation time would be stale by then.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!transcript) return;

    const currentPhase    = phaseRef.current;
    const currentMode     = listeningModeRef.current;
    const question        = currentQuestionRef.current;
    const idx             = currentIndexRef.current;
    const qIds            = questionIdsRef.current;
    const isLast          = idx + 1 >= qIds.length;

    // --- MODE: answer ---
    if (currentPhase === "in_question" && currentMode === "answer" && question) {
      const matchedId = matchOptionFromTranscript(transcript, question.options);

      if (matchedId !== null) {
        const matchedOpt = question.options.find((o: { id: number; option_text: string }) => o.id === matchedId);
        const optIndex   = question.options.findIndex((o: { id: number }) => o.id === matchedId) + 1;
        const confirmText = `Selecting Option ${optIndex}: ${matchedOpt?.option_text ?? ""}. Submitting.`;

        setPickedOptionId(matchedId);

        if (ttsSupported) {
          speakThen(confirmText, () => submitAnswer(matchedId, false));
        } else {
          submitAnswer(matchedId, false);
        }
      } else {
        // No match — tell the learner and re-open mic
        const count = question.options.length;
        const retryText =
          `Could not understand. I heard: ${transcript}. ` +
          `Please say a number from 1 to ${count}. For example say "one" or "option 2". ` +
          `Listening again.`;
        if (ttsSupported) {
          speakThen(retryText, () => setTimeout(() => startListening(), 300));
        } else {
          startListening();
        }
      }
      return;
    }

    // --- MODE: confirm_next ---
    if (currentPhase === "feedback" && currentMode === "confirm_next") {
      const t      = transcript.trim().toLowerCase();
      const isYes  = /\b(yes|yeah|yep|sure|ok|okay|go|next|continue|proceed|finish|done)\b/.test(t);
      const isNo   = /\b(no|nope|nah|wait|stop|stay|repeat|again)\b/.test(t);

      if (isYes) {
        const confirmText = isLast ? "Finishing assessment." : "Moving to the next question.";
        if (ttsSupported) {
          speakThen(confirmText, () => {
            if (isLast) loadResult();
            else nextQuestion();
          });
        } else {
          if (isLast) loadResult();
          else nextQuestion();
        }
      } else if (isNo) {
        const stayText = "Okay, staying. Say yes when you are ready to continue.";
        if (ttsSupported) {
          speakThen(stayText, () => setTimeout(() => startListening(), 300));
        } else {
          startListening();
        }
      } else {
        // Didn't catch yes or no — repeat the prompt and re-open mic
        const askAgain = isLast
          ? `I heard: ${transcript}. Please say yes to finish, or no to stay.`
          : `I heard: ${transcript}. Please say yes to move on, or no to stay.`;
        if (ttsSupported) {
          speakThen(askAgain, () => setTimeout(() => startListening(), 300));
        } else {
          startListening();
        }
      }
      return;
    }
  // transcript is the only real trigger; all other values read from refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  // -------------------------------------------------------------------------
  // Stop speech + mic when leaving active phases entirely
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "in_question" && phase !== "feedback" && phase !== "submitting") {
      stopSpeech();
      stopListening();
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

              {/* ---- Voice toolbar (TTS + STT) ---- */}
              <TTSToolbar
                questionText={currentQuestion.question_text}
                feedbackText={
                  phase === "feedback" ? buildFeedbackSpeech() : null
                }
                speaking={speaking}
                ttsSupported={ttsSupported}
                isFallbackVoice={isFallbackVoice}
                voiceName={voiceName}
                onReadQuestion={handleTTSReadQuestion}
                onReadFeedback={handleTTSReadFeedback}
                onStop={stopSpeech}
                sttSupported={sttSupported}
                listening={listening}
                transcript={transcript}
                sttError={sttError}
                onStartListening={startListening}
                onStopListening={stopListening}
                canAnswer={phase === "in_question"}
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

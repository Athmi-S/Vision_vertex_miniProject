/**
 * TTSToolbar.tsx — Accessible Text-to-Speech + Speech Input control bar.
 *
 * TTS buttons:
 *   "▶ Read Question"  — speaks question text + all options
 *   "▶ Read Feedback"  — speaks outcome + explanation (feedback phase only)
 *   "■ Stop"           — cancels speech immediately
 *
 * STT button (when STT is supported):
 *   "🎤 Say Your Answer" — opens microphone, listens for the learner's answer,
 *                          matches it to an option, selects it automatically,
 *                          and optionally auto-submits.
 *   "⏹ Stop Listening"  — closes microphone immediately
 *
 * Props:
 *   questionText      — the full question string
 *   feedbackText      — string for feedback; null hides the feedback button
 *   speaking          — whether TTS is currently active
 *   listening         — whether STT microphone is open
 *   transcript        — last recognised transcript (shown for visual confirmation)
 *   sttError          — STT error message (empty = no error)
 *   ttsSupported      — whether speechSynthesis is available
 *   sttSupported      — whether SpeechRecognition is available
 *   isFallbackVoice   — true when no matching TTS language voice was found
 *   voiceName         — display name of the TTS voice being used
 *   onReadQuestion    — callback: speak question
 *   onReadFeedback    — callback: speak feedback
 *   onStop            — callback: stop TTS
 *   onStartListening  — callback: open microphone
 *   onStopListening   — callback: close microphone
 */

import "./TTSToolbar.css";

interface TTSToolbarProps {
  // TTS
  questionText: string;
  feedbackText: string | null;
  speaking: boolean;
  ttsSupported: boolean;
  isFallbackVoice: boolean;
  voiceName: string;
  onReadQuestion: () => void;
  onReadFeedback: () => void;
  onStop: () => void;
  // STT
  sttSupported: boolean;
  listening: boolean;
  transcript: string;
  sttError: string;
  onStartListening: () => void;
  onStopListening: () => void;
  /** True when the phase is in_question (STT answer button only shown then) */
  canAnswer: boolean;
}

function TTSToolbar({
  questionText,
  feedbackText,
  speaking,
  ttsSupported,
  isFallbackVoice,
  voiceName,
  onReadQuestion,
  onReadFeedback,
  onStop,
  sttSupported,
  listening,
  transcript,
  sttError,
  onStartListening,
  onStopListening,
  canAnswer,
}: TTSToolbarProps) {

  const hasQuestion = questionText.trim().length > 0;
  const hasFeedback = feedbackText !== null && feedbackText.trim().length > 0;
  const neitherSupported = !ttsSupported && !sttSupported;

  // -------------------------------------------------------------------------
  // Neither TTS nor STT supported — plain text notice
  // -------------------------------------------------------------------------
  if (neitherSupported) {
    return (
      <p className="tts-unsupported" role="note">
        Voice features are not available in this browser. All content remains
        readable and usable with keyboard and mouse.
      </p>
    );
  }

  return (
    <div
      className="tts-toolbar"
      role="group"
      aria-label="Voice controls"
    >
      <span className="tts-toolbar-label" aria-hidden="true">
        🔊 Voice:
      </span>

      {/* ------------------------------------------------------------------ */}
      {/* TTS section                                                         */}
      {/* ------------------------------------------------------------------ */}
      {ttsSupported && (
        <>
          {/* Read question */}
          <button
            type="button"
            className={`tts-btn${speaking ? " tts-btn-active" : ""}`}
            onClick={onReadQuestion}
            disabled={!hasQuestion || listening}
            aria-label={
              speaking
                ? "Currently reading question — click to restart"
                : "Read question and options aloud"
            }
            aria-pressed={speaking}
          >
            {speaking ? "▶ Speaking…" : "▶ Read Question"}
          </button>

          {/* Read feedback (only in feedback phase) */}
          {hasFeedback && (
            <button
              type="button"
              className="tts-btn"
              onClick={onReadFeedback}
              disabled={listening}
              aria-label="Read answer feedback and explanation aloud"
            >
              ▶ Read Feedback
            </button>
          )}

          {/* Stop TTS */}
          <button
            type="button"
            className="tts-btn tts-btn-stop"
            onClick={onStop}
            disabled={!speaking}
            aria-label="Stop speaking"
          >
            ■ Stop
          </button>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STT section                                                         */}
      {/* ------------------------------------------------------------------ */}
      {sttSupported && canAnswer && (
        <>
          {!listening ? (
            <button
              type="button"
              className="tts-btn tts-btn-mic"
              onClick={onStartListening}
              disabled={speaking}
              aria-label="Say your answer aloud — microphone will open"
            >
              🎤 Say Answer
            </button>
          ) : (
            <button
              type="button"
              className="tts-btn tts-btn-mic tts-btn-active"
              onClick={onStopListening}
              aria-label="Stop listening"
              aria-pressed={true}
            >
              ⏹ Listening…
            </button>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Status messages                                                     */}
      {/* ------------------------------------------------------------------ */}

      {/* Transcript confirmation — shows what was heard */}
      {transcript && !listening && (
        <p
          className="tts-transcript"
          role="status"
          aria-live="polite"
        >
          Heard: "<strong>{transcript}</strong>"
        </p>
      )}

      {/* STT error */}
      {sttError && (
        <p
          className="tts-stt-error"
          role="alert"
        >
          {sttError}
        </p>
      )}

      {/* Fallback voice notice */}
      {ttsSupported && isFallbackVoice && voiceName && (
        <p className="tts-fallback-notice" role="note">
          No voice found for your preferred language. Using: {voiceName}.
        </p>
      )}

      {/* TTS not supported notice (but STT is) */}
      {!ttsSupported && sttSupported && (
        <p className="tts-fallback-notice" role="note">
          Read-aloud is not available in this browser, but voice answer input is.
        </p>
      )}

      {/* Polite live region for screen readers */}
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
      >
        {listening ? "Listening for your answer" : speaking ? "Speaking" : ""}
      </span>
    </div>
  );
}

export default TTSToolbar;

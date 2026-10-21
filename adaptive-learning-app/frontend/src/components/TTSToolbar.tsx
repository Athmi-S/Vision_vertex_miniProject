/**
 * TTSToolbar.tsx — Accessible Text-to-Speech control bar.
 *
 * Renders three contextual buttons:
 *   "Read question aloud"  — speaks the question text + all option texts
 *   "Read feedback aloud"  — speaks outcome + explanation (feedback phase only)
 *   "Stop speaking"        — cancels current speech immediately
 *
 * Props:
 *   questionText   — the full question string (required)
 *   options        — array of {id, option_text} (required)
 *   feedbackText   — string to read for feedback; null hides the feedback button
 *   languagePref   — BCP-47 short code from learner profile ("en","hi","kn","ta")
 *   speaking       — whether TTS is currently active (from useTTS)
 *   onReadQuestion — callback: speak question + options
 *   onReadFeedback — callback: speak feedback
 *   onStop         — callback: stop speech
 *   supported      — whether speechSynthesis is available in this browser
 *   isFallbackVoice — true when no matching language voice was found
 *   voiceName       — display name of the voice being used
 *
 * Accessibility:
 *  - All buttons have descriptive aria-labels (not just icons)
 *  - aria-pressed on each read button when it is the active utterance
 *  - aria-live region announces when speech starts/stops to screen readers
 *  - Buttons are keyboard-accessible (Tab + Enter/Space)
 *  - Unsupported state shows a plain text notice, no hidden content
 */

import "./TTSToolbar.css";

interface TTSToolbarProps {
  questionText: string;
  feedbackText: string | null;
  speaking: boolean;
  supported: boolean;
  isFallbackVoice: boolean;
  voiceName: string;
  onReadQuestion: () => void;
  onReadFeedback: () => void;
  onStop: () => void;
}

function TTSToolbar({
  questionText,
  feedbackText,
  speaking,
  supported,
  isFallbackVoice,
  voiceName,
  onReadQuestion,
  onReadFeedback,
  onStop,
}: TTSToolbarProps) {
  // -------------------------------------------------------------------------
  // Not supported — show a brief explanation and nothing else
  // -------------------------------------------------------------------------
  if (!supported) {
    return (
      <p className="tts-unsupported" role="note">
        Text-to-speech is not available in this browser. All content remains
        readable on screen.
      </p>
    );
  }

  const hasQuestion = questionText.trim().length > 0;
  const hasFeedback = feedbackText !== null && feedbackText.trim().length > 0;

  return (
    <div
      className="tts-toolbar"
      role="group"
      aria-label="Text-to-speech controls"
    >
      {/* Screen-reader-only label for the group */}
      <span className="tts-toolbar-label" aria-hidden="true">
        🔊 Read aloud:
      </span>

      {/* ---- Read question button ---- */}
      <button
        type="button"
        className={`tts-btn${speaking ? " tts-btn-active" : ""}`}
        onClick={onReadQuestion}
        disabled={!hasQuestion}
        aria-label={
          speaking
            ? "Speaking question aloud — click to restart"
            : "Read question aloud"
        }
        aria-pressed={speaking}
      >
        {speaking ? "▶ Speaking…" : "▶ Read Question"}
      </button>

      {/* ---- Read feedback button (only in feedback phase) ---- */}
      {hasFeedback && (
        <button
          type="button"
          className="tts-btn"
          onClick={onReadFeedback}
          aria-label="Read answer feedback and explanation aloud"
        >
          ▶ Read Feedback
        </button>
      )}

      {/* ---- Stop button ---- */}
      <button
        type="button"
        className="tts-btn tts-btn-stop"
        onClick={onStop}
        disabled={!speaking}
        aria-label="Stop speaking"
      >
        ■ Stop
      </button>

      {/* ---- Fallback voice notice ---- */}
      {isFallbackVoice && voiceName && (
        <p className="tts-fallback-notice" role="note">
          No voice found for your preferred language. Using: {voiceName}.
        </p>
      )}

      {/* ---- Polite live region so screen readers hear start/stop ---- */}
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
        {speaking ? "Speaking" : ""}
      </span>
    </div>
  );
}

export default TTSToolbar;

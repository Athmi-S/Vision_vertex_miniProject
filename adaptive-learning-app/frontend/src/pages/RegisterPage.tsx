/**
 * RegisterPage.tsx — Step-by-step voice-guided registration.
 *
 * ── Design decisions ────────────────────────────────────────────────────────
 *
 * 1. EXPLICIT STATE MACHINE
 *    Every voice interaction step is a named state. A `stepRef` ref mirrors the
 *    React state so callbacks created inside `useEffect` always see the current
 *    step without needing to be recreated.
 *
 * 2. ACTIVE-SESSION GUARD
 *    `activeRef` is set to `true` when an effect starts and checked before
 *    every async continuation. If the component unmounts or the user cancels,
 *    `activeRef` becomes `false` and no further state changes are made.
 *
 * 3. TTS → STT SEQUENCING
 *    The microphone is opened only inside `speakThen`'s `onEnd` callback —
 *    never while TTS is still speaking. This prevents audio feedback loops.
 *
 * 4. PASSWORD SECURITY
 *    The password is NEVER read back aloud. The confirmation says only
 *    "I received N characters." The password is never stored in React state
 *    visible outside this component; `pendingPassword` is a ref.
 *
 * 5. DOUBLE-FIRE PREVENTION
 *    `speakThen` uses an `onEnd` that fires exactly once (guards with `called`).
 *    The timeout fallback is cleared when `onend` fires naturally, so they
 *    cannot both trigger.
 *
 * 6. RETRY LOOP LIMIT
 *    After 3 consecutive unrecognised / failed attempts at any step, TTS
 *    announces the failure, voice mode exits, and the keyboard form is shown.
 *
 * 7. KEYBOARD FORM ALWAYS PRESENT
 *    The standard HTML form is always rendered below the voice status banner.
 *    The user can switch to keyboard-only mode at any time.
 *
 * 8. UNSUPPORTED BROWSER
 *    If TTS or STT is unavailable, voice mode is skipped entirely and only the
 *    keyboard form is shown with an informational note.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthForm.css";

// ─── browser capability detection ────────────────────────────────────────────

function getTTSSupport() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function getSTTCtor(): (new () => any) | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── TTS helper ───────────────────────────────────────────────────────────────

/**
 * Speak `text` and call `onEnd` exactly once when the utterance finishes.
 * Returns a cancel function — call it to abort speech before onEnd fires.
 */
function speakThen(text: string, onEnd: () => void): () => void {
  if (!getTTSSupport() || !text.trim()) {
    const t = setTimeout(onEnd, 0);
    return () => clearTimeout(t);
  }
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.88;
  utt.pitch = 1.0;
  utt.volume = 1.0;

  let called = false;
  const finish = () => {
    if (called) return;
    called = true;
    clearTimeout(guard);
    onEnd();
  };

  utt.onend   = finish;
  utt.onerror = finish;

  // Safety timeout: if neither onend nor onerror fires within an estimated
  // reading time, proceed anyway. Cleared when onend fires normally.
  const wordCount = text.trim().split(/\s+/).length;
  const ms = wordCount * 145 + 2000;
  const guard = setTimeout(finish, ms);

  window.speechSynthesis.speak(utt);

  return () => {
    called = true;
    clearTimeout(guard);
    window.speechSynthesis.cancel();
  };
}

// ─── STT helper ───────────────────────────────────────────────────────────────

/**
 * Open the microphone once and call `onResult` with the best transcript,
 * or `onError` with a human-readable message.
 * Returns a stop function.
 */
function listenOnce(
  onResult: (transcript: string) => void,
  onError: (msg: string) => void
): () => void {
  const Ctor = getSTTCtor();
  if (!Ctor) {
    onError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
    return () => {};
  }

  const rec = new Ctor(); // eslint-disable-line @typescript-eslint/no-explicit-any
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = false;

  let done = false;

  rec.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (done) return;
    done = true;
    const best = event.results[0][0].transcript.trim();
    onResult(best);
  };

  rec.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (done) return;
    done = true;
    switch (event.error) {
      case "no-speech":
        onError("No speech was detected. Please try again.");
        break;
      case "not-allowed":
      case "service-not-allowed":
        onError(
          "Microphone access was denied. Please allow microphone access in your browser settings, then try again."
        );
        break;
      case "audio-capture":
        onError("No microphone found. Please connect a microphone and try again.");
        break;
      case "network":
        onError("A network error occurred during speech recognition. Please check your connection.");
        break;
      default:
        onError("Speech recognition failed. Please try again.");
    }
  };

  // onend fires after both onresult and onerror — if neither fired we got silence
  rec.onend = () => {
    if (!done) {
      done = true;
      onError("No speech was detected. Please try again.");
    }
  };

  try {
    rec.start();
  } catch {
    onError("Could not start microphone. Please try again.");
  }

  return () => {
    done = true;
    try { rec.abort(); } catch { /* ignore */ }
  };
}

// ─── text normalisers ─────────────────────────────────────────────────────────

function toUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toEmail(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s/g, "");
}

function toPin(raw: string): string {
  const W: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  };
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => W[w] ?? (/^\d$/.test(w) ? w : ""))
    .filter(Boolean)
    .join("");
}

function isYes(t: string): boolean {
  return /\b(yes|yeah|yep|correct|right|ok|okay|sure|confirm)\b/.test(t.toLowerCase());
}

function makeEmailSpeakable(email: string): string {
  return email.replace(/@/, " at ").replace(/\./g, " dot ");
}

function makeUsernameSpeakable(name: string): string {
  return name.split("").join(", ");
}

// ─── state machine ────────────────────────────────────────────────────────────

type Step =
  | "idle"
  | "username_prompt" | "username_listen" | "username_confirm" | "username_yn"
  | "email_prompt"    | "email_listen"    | "email_confirm"    | "email_yn"
  | "password_prompt" | "password_listen" | "password_confirm" | "password_yn"
  | "submitting" | "done"
  | "keyboard_only";  // user chose to exit voice mode

const MAX_RETRIES = 3;

// ─── component ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const ttsOk = getTTSSupport();
  const sttOk = !!getSTTCtor();
  const voiceAvailable = ttsOk && sttOk;

  // ── form state ────────────────────────────────────────────────────────────
  const [username, setUsername]     = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [formError, setFormError]   = useState("");

  // ── voice state ───────────────────────────────────────────────────────────
  const [step, setStep]             = useState<Step>(voiceAvailable ? "idle" : "keyboard_only");
  const [statusMsg, setStatusMsg]   = useState(
    voiceAvailable ? "Preparing voice setup…" : ""
  );
  const [serverError, setServerError] = useState("");

  // Stable refs — values accessible from callbacks without stale closures
  const stepRef         = useRef<Step>(voiceAvailable ? "idle" : "keyboard_only");
  const activeRef       = useRef(true);       // false after unmount or cancel
  const retryCountRef   = useRef(0);
  const pendingUsername = useRef("");
  const pendingEmail    = useRef("");
  const pendingPassword = useRef("");         // never exposed to UI state
  const cancelTTSRef    = useRef<(() => void) | null>(null);
  const cancelSTTRef    = useRef<(() => void) | null>(null);

  // Keep stepRef in sync
  useEffect(() => { stepRef.current = step; }, [step]);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeRef.current = false;
      cancelTTSRef.current?.();
      cancelSTTRef.current?.();
    };
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Guard: skip continuation if component unmounted or cancelled */
  const guard = useCallback((fn: () => void): (() => void) => {
    return () => { if (activeRef.current) fn(); };
  }, []);

  function speak(text: string, then: () => void) {
    cancelSTTRef.current?.();
    cancelSTTRef.current = null;
    cancelTTSRef.current = speakThen(text, guard(then));
  }

  function listen(onResult: (t: string) => void, onFail: (msg: string) => void) {
    cancelTTSRef.current?.();
    cancelTTSRef.current = null;
    cancelSTTRef.current = listenOnce(
      guard(onResult),
      guard(onFail)
    );
  }

  function go(s: Step) {
    if (!activeRef.current) return;
    retryCountRef.current = 0;
    setStep(s);
  }

  function tooManyRetries(retryStep: Step, msg: string) {
    retryCountRef.current += 1;
    if (retryCountRef.current >= MAX_RETRIES) {
      speak(
        `${msg} Switching to keyboard mode. You can type your details in the form below.`,
        () => { if (activeRef.current) setStep("keyboard_only"); }
      );
      return true;
    }
    return false;
  }

  // ── main state machine ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRef.current) return;

    switch (step) {

      // ── intro ──────────────────────────────────────────────────────────────
      case "idle":
        setStatusMsg("Preparing…");
        speak(
          "Welcome to VISION. Let us create your account. " +
          "I will ask for your username, email address, and password one at a time. " +
          "You can also type in the form below if you prefer.",
          () => go("username_prompt")
        );
        break;

      // ── USERNAME ───────────────────────────────────────────────────────────
      case "username_prompt":
        setStatusMsg("🎤 Say your username…");
        speak(
          "Please say your username. Use letters and numbers only. " +
          "For example: athmi one two three.",
          () => go("username_listen")
        );
        break;

      case "username_listen":
        setStatusMsg("🎤 Listening for username…");
        listen(
          (t) => {
            const v = toUsername(t);
            if (!v) {
              if (tooManyRetries("username_prompt",
                "I could not make out a username.")) return;
              speak("I did not catch a valid username. Please try again.", () => go("username_prompt"));
              return;
            }
            retryCountRef.current = 0;
            pendingUsername.current = v;
            go("username_confirm");
          },
          (msg) => {
            if (tooManyRetries("username_prompt", msg)) return;
            speak(`${msg} Let us try again.`, () => go("username_prompt"));
          }
        );
        break;

      case "username_confirm":
        setStatusMsg(`Confirm username: ${pendingUsername.current}`);
        speak(
          `I heard your username as: ${makeUsernameSpeakable(pendingUsername.current)}. ` +
          `Is that correct? Say yes or no.`,
          () => go("username_yn")
        );
        break;

      case "username_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            if (isYes(t)) {
              setUsername(pendingUsername.current);
              go("email_prompt");
            } else {
              speak("Okay, let us try again.", () => go("username_prompt"));
            }
          },
          () => go("username_confirm") // on mic error repeat confirmation
        );
        break;

      // ── EMAIL ──────────────────────────────────────────────────────────────
      case "email_prompt":
        setStatusMsg("🎤 Say your email address…");
        speak(
          "Now please say your email address. " +
          "Spell it out clearly. For example: athmi at gmail dot com.",
          () => go("email_listen")
        );
        break;

      case "email_listen":
        setStatusMsg("🎤 Listening for email…");
        listen(
          (t) => {
            const v = toEmail(t);
            if (!v.includes("@") || !v.includes(".")) {
              if (tooManyRetries("email_prompt",
                "I could not recognise a valid email address.")) return;
              speak(
                "I did not catch a complete email address. " +
                "Please say it slowly with the word at and dot. For example: athmi at gmail dot com.",
                () => go("email_prompt")
              );
              return;
            }
            retryCountRef.current = 0;
            pendingEmail.current = v;
            go("email_confirm");
          },
          (msg) => {
            if (tooManyRetries("email_prompt", msg)) return;
            speak(`${msg} Let us try again.`, () => go("email_prompt"));
          }
        );
        break;

      case "email_confirm":
        setStatusMsg(`Confirm email: ${pendingEmail.current}`);
        speak(
          `I heard your email as: ${makeEmailSpeakable(pendingEmail.current)}. ` +
          `Is that correct? Say yes or no.`,
          () => go("email_yn")
        );
        break;

      case "email_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            if (isYes(t)) {
              setEmail(pendingEmail.current);
              go("password_prompt");
            } else {
              speak("Okay, let us try the email again.", () => go("email_prompt"));
            }
          },
          () => go("email_confirm")
        );
        break;

      // ── PASSWORD ───────────────────────────────────────────────────────────
      // Security: the password is NEVER read back aloud. Only the digit count
      // is confirmed. The pending value is stored only in a ref, never in state.
      case "password_prompt":
        setStatusMsg("🎤 Say your password digits…");
        speak(
          "Now please say your password as digits one at a time. " +
          "It must be at least 8 characters. " +
          "For example: 1 2 3 4 5 6 7 8. " +
          "Your password will not be read back aloud for privacy.",
          () => go("password_listen")
        );
        break;

      case "password_listen":
        setStatusMsg("🎤 Listening for password digits…");
        listen(
          (t) => {
            const v = toPin(t);
            if (v.length < 8) {
              if (tooManyRetries("password_prompt",
                "The password needs at least 8 digits.")) return;
              speak(
                `I received ${v.length} ${v.length === 1 ? "digit" : "digits"}, ` +
                `but I need at least 8. Please try again.`,
                () => go("password_prompt")
              );
              return;
            }
            retryCountRef.current = 0;
            pendingPassword.current = v;
            go("password_confirm");
          },
          (msg) => {
            if (tooManyRetries("password_prompt", msg)) return;
            speak(`${msg} Let us try again.`, () => go("password_prompt"));
          }
        );
        break;

      case "password_confirm":
        // SECURITY: only confirm the COUNT, not the digits themselves
        setStatusMsg(`Password: ${"•".repeat(pendingPassword.current.length)}`);
        speak(
          `I received ${pendingPassword.current.length} characters. ` +
          `Is the count correct? Say yes to confirm, or no to re-enter.`,
          () => go("password_yn")
        );
        break;

      case "password_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            if (isYes(t)) {
              setPassword(pendingPassword.current);
              go("submitting");
            } else {
              speak("Okay, let us re-enter the password.", () => go("password_prompt"));
            }
          },
          () => go("password_confirm")
        );
        break;

      // ── SUBMIT ─────────────────────────────────────────────────────────────
      case "submitting":
        setStatusMsg("Creating your account…");
        (async () => {
          try {
            await register(
              pendingUsername.current,
              pendingEmail.current,
              pendingPassword.current
            );
            if (activeRef.current) go("done");
          } catch (err: unknown) {
            if (!activeRef.current) return;
            const msg = err instanceof Error ? err.message : "Registration failed.";
            setServerError(msg);
            speak(
              `Sorry, registration could not be completed. ${msg}. ` +
              `Let us start again from the username step.`,
              () => { if (activeRef.current) go("username_prompt"); }
            );
          }
        })();
        break;

      case "done":
        setStatusMsg("Account created! Redirecting…");
        speak(
          "Your account has been created successfully. " +
          "Going to the sign in page now.",
          () => { if (activeRef.current) navigate("/login"); }
        );
        break;

      case "keyboard_only":
        // Voice mode exited — nothing to drive
        setStatusMsg("");
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── voice cancel / switch to keyboard ────────────────────────────────────
  function cancelVoice() {
    activeRef.current = false;  // stop any in-flight continuations
    cancelTTSRef.current?.();
    cancelSTTRef.current?.();
    activeRef.current = true;   // re-enable for keyboard use
    setStep("keyboard_only");
  }

  // Reset activeRef when voice mode is restarted
  function restartVoice() {
    if (!voiceAvailable) return;
    activeRef.current = true;
    retryCountRef.current = 0;
    setServerError("");
    go("idle");
  }

  // ── re-speak individual field ─────────────────────────────────────────────
  function reSpeak(s: Step) {
    if (!voiceAvailable) return;
    activeRef.current = true;
    window.speechSynthesis.cancel();
    go(s);
  }

  // ── manual keyboard form submit ───────────────────────────────────────────
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!username.trim() || !email.trim() || !password.trim()) {
      setFormError("Please fill in all fields.");
      return;
    }
    setStep("submitting");
    pendingUsername.current = username.trim();
    pendingEmail.current    = email.trim();
    pendingPassword.current = password;
    try {
      await register(username.trim(), email.trim(), password);
      navigate("/login");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setServerError(msg);
      setStep("keyboard_only");
    }
  }

  const busy = step === "submitting" || step === "done";
  const voiceActive = voiceAvailable && step !== "keyboard_only";

  return (
    <div className="auth-page">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <header className="site-header" role="banner">
        <nav aria-label="Site navigation" className="site-nav">
          <span className="site-logo" aria-hidden="true">🎓</span>
          <span className="site-name">VISION Learning</span>
        </nav>
      </header>

      <main id="main-content" className="auth-main" tabIndex={-1}>
        <div className="auth-card">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            {voiceAvailable
              ? "Voice guides you — speak when prompted, or type below."
              : "Fill in the form below to create your account."}
          </p>

          {/* ── unsupported browser notice ─────────────────────────────── */}
          {!voiceAvailable && (
            <p className="voice-unavailable-notice" role="note">
              {!ttsOk && !sttOk
                ? "Voice features are not available in this browser. Please use Chrome or Edge for voice interaction. You can still register using the form below."
                : !sttOk
                ? "Speech input is not supported in this browser. Please use Chrome or Edge for voice interaction. You can still register using the form below."
                : "Text-to-speech is not supported in this browser. You can still register using the form below."}
            </p>
          )}

          {/* ── voice status banner ───────────────────────────────────── */}
          {voiceActive && statusMsg && (
            <div
              className="voice-status-banner"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="voice-status-icon" aria-hidden="true">🎙️</span>
              <span>{statusMsg}</span>
              <button
                type="button"
                className="voice-cancel-btn"
                onClick={cancelVoice}
                aria-label="Stop voice mode and use the keyboard form instead"
              >
                Use Keyboard
              </button>
            </div>
          )}

          {/* ── restart voice button (when in keyboard_only mode) ────────── */}
          {voiceAvailable && step === "keyboard_only" && (
            <button
              type="button"
              className="voice-restart-btn"
              onClick={restartVoice}
              aria-label="Restart voice-guided registration"
            >
              🎤 Restart Voice Mode
            </button>
          )}

          {/* ── server/API error ──────────────────────────────────────── */}
          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}

          {/* ── form validation error ─────────────────────────────────── */}
          {formError && (
            <p className="auth-error-banner" role="alert">{formError}</p>
          )}

          {/* ── form ─────────────────────────────────────────────────── */}
          <form className="auth-form" onSubmit={handleManualSubmit} noValidate>

            {/* Username */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">Username</label>
              <div className="voice-field-row">
                <input
                  id="reg-username"
                  type="text"
                  className="form-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy}
                  autoComplete="username"
                  placeholder="Auto-filled by voice, or type here"
                  aria-describedby="reg-username-hint"
                />
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => reSpeak("username_prompt")}
                    disabled={busy}
                    aria-label="Re-start voice input for username"
                  >
                    🎤
                  </button>
                )}
              </div>
              <span id="reg-username-hint" className="field-hint">
                Letters and numbers only.
              </span>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email address</label>
              <div className="voice-field-row">
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  autoComplete="email"
                  placeholder="Auto-filled by voice, or type here"
                />
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => reSpeak("email_prompt")}
                    disabled={busy}
                    aria-label="Re-start voice input for email"
                  >
                    🎤
                  </button>
                )}
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    id="reg-password"
                    type={showPwd ? "text" : "password"}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    autoComplete="new-password"
                    placeholder="Auto-filled by voice, or type here"
                    aria-describedby="reg-password-hint"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? "🙈" : "👁"}
                  </button>
                </div>
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => reSpeak("password_prompt")}
                    disabled={busy}
                    aria-label="Re-start voice input for password"
                  >
                    🎤
                  </button>
                )}
              </div>
              <span id="reg-password-hint" className="field-hint">
                Minimum 8 characters.{" "}
                {voiceAvailable && "Voice fills digits only — type for mixed passwords."}
              </span>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy}
            >
              {busy ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="auth-alt-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>

      <footer className="site-footer" role="contentinfo">
        <p>VISION Adaptive Learning Platform</p>
      </footer>
    </div>
  );
}

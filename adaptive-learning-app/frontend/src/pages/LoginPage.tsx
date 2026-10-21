/**
 * LoginPage.tsx — Step-by-step voice-guided sign in.
 *
 * ── Design decisions ────────────────────────────────────────────────────────
 *
 * 1. IDENTIFIER: email (matches the existing POST /auth/login API which
 *    accepts { email, password }). The voice prompt says "email address"
 *    to match the backend contract.
 *
 * 2. STATE MACHINE + ACTIVE GUARD
 *    Same pattern as RegisterPage — `activeRef` prevents any callback from
 *    driving state changes after unmount or voice-cancel.
 *
 * 3. PASSWORD SECURITY
 *    The password is NEVER read back aloud. Voice says "digits received" only.
 *    The pending password is stored only in a ref (never in visible React state).
 *
 * 4. GENERIC LOGIN ERROR
 *    On a failed login, we announce a generic "incorrect credentials" message.
 *    We do NOT say whether the email or password specifically was wrong (prevents
 *    account enumeration). This matches the backend's 401 detail message.
 *
 * 5. NAVIGATION GUARD
 *    navigate("/dashboard") is called only after the login() Promise resolves
 *    and /auth/me returns a valid user. The AuthContext handles this internally.
 *
 * 6. ESCAPE HATCH
 *    "Use Keyboard" button cancels voice mid-flow without losing any typed values.
 *    Voice can be restarted with the "Restart Voice Mode" button.
 *
 * 7. KEYBOARD FORM
 *    Always rendered — works independently of voice mode.
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

// ─── state machine ────────────────────────────────────────────────────────────

type Step =
  | "idle"
  | "email_prompt"    | "email_listen"    | "email_confirm"    | "email_yn"
  | "password_prompt" | "password_listen" | "password_confirm" | "password_yn"
  | "logging_in" | "done"
  | "keyboard_only";

const MAX_RETRIES = 3;

// ─── component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const ttsOk = getTTSSupport();
  const sttOk = !!getSTTCtor();
  const voiceAvailable = ttsOk && sttOk;

  // ── form state ────────────────────────────────────────────────────────────
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [formError, setFormError]   = useState("");

  // ── voice state ───────────────────────────────────────────────────────────
  const [step, setStep]             = useState<Step>(voiceAvailable ? "idle" : "keyboard_only");
  const [statusMsg, setStatusMsg]   = useState(
    voiceAvailable ? "Preparing voice sign in…" : ""
  );
  const [serverError, setServerError] = useState("");

  // Stable refs
  const activeRef       = useRef(true);
  const retryCountRef   = useRef(0);
  const pendingEmail    = useRef("");
  const pendingPassword = useRef("");  // NEVER exposed to TTS
  const cancelTTSRef    = useRef<(() => void) | null>(null);
  const cancelSTTRef    = useRef<(() => void) | null>(null);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeRef.current = false;
      cancelTTSRef.current?.();
      cancelSTTRef.current?.();
    };
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────

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

  function tooManyRetries(msg: string): boolean {
    retryCountRef.current += 1;
    if (retryCountRef.current >= MAX_RETRIES) {
      speak(
        `${msg} Switching to keyboard mode. Please type your credentials in the form below.`,
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
          "Welcome back. Let us sign you in. " +
          "I will ask for your email address and password. " +
          "You can also type in the form below if you prefer.",
          () => go("email_prompt")
        );
        break;

      // ── EMAIL ──────────────────────────────────────────────────────────────
      case "email_prompt":
        setStatusMsg("🎤 Say your email address…");
        speak(
          "Please say your email address. " +
          "For example: athmi at gmail dot com.",
          () => go("email_listen")
        );
        break;

      case "email_listen":
        setStatusMsg("🎤 Listening for email…");
        listen(
          (t) => {
            const v = toEmail(t);
            if (!v.includes("@") || !v.includes(".")) {
              if (tooManyRetries("I could not recognise a valid email address.")) return;
              speak(
                "I did not catch a complete email address. " +
                "Please say it slowly — for example: athmi at gmail dot com.",
                () => go("email_prompt")
              );
              return;
            }
            retryCountRef.current = 0;
            pendingEmail.current = v;
            go("email_confirm");
          },
          (msg) => {
            if (tooManyRetries(msg)) return;
            speak(`${msg} Let us try again.`, () => go("email_prompt"));
          }
        );
        break;

      case "email_confirm":
        setStatusMsg(`Confirm: ${pendingEmail.current}`);
        speak(
          `I heard: ${makeEmailSpeakable(pendingEmail.current)}. ` +
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
      // SECURITY: password is NEVER read back aloud. Only the character count
      // is confirmed. pendingPassword is stored in a ref only.
      case "password_prompt":
        setStatusMsg("🎤 Say your password digits…");
        speak(
          "Now please say your password as digits, one at a time. " +
          "Your password will not be read back for privacy.",
          () => go("password_listen")
        );
        break;

      case "password_listen":
        setStatusMsg("🎤 Listening for password…");
        listen(
          (t) => {
            const v = toPin(t);
            if (!v) {
              if (tooManyRetries("I could not make out any digits.")) return;
              speak("I did not catch any digits. Please try again.", () => go("password_prompt"));
              return;
            }
            retryCountRef.current = 0;
            pendingPassword.current = v;
            go("password_confirm");
          },
          (msg) => {
            if (tooManyRetries(msg)) return;
            speak(`${msg} Let us try again.`, () => go("password_prompt"));
          }
        );
        break;

      case "password_confirm":
        // SECURITY: say only the count — never the actual characters
        setStatusMsg(`Password: ${"•".repeat(pendingPassword.current.length)}`);
        speak(
          `I received ${pendingPassword.current.length} ` +
          `${pendingPassword.current.length === 1 ? "character" : "characters"}. ` +
          `Is that correct? Say yes or no.`,
          () => go("password_yn")
        );
        break;

      case "password_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            if (isYes(t)) {
              setPassword(pendingPassword.current);
              go("logging_in");
            } else {
              speak("Okay, let us re-enter the password.", () => go("password_prompt"));
            }
          },
          () => go("password_confirm")
        );
        break;

      // ── LOGIN ──────────────────────────────────────────────────────────────
      case "logging_in":
        setStatusMsg("Signing in…");
        (async () => {
          try {
            await login(pendingEmail.current, pendingPassword.current);
            if (activeRef.current) go("done");
          } catch {
            // SECURITY: never expose whether the email or password was wrong
            if (!activeRef.current) return;
            const genericMsg = "The email address or password is incorrect.";
            setServerError(genericMsg);
            speak(
              `Sign in failed. ${genericMsg} Please try again.`,
              () => { if (activeRef.current) go("email_prompt"); }
            );
          }
        })();
        break;

      case "done":
        setStatusMsg("Signed in! Going to dashboard…");
        speak(
          "Sign in successful. Going to your dashboard now.",
          // Only navigate after TTS finishes — dashboard will validate session
          () => { if (activeRef.current) navigate("/dashboard"); }
        );
        break;

      case "keyboard_only":
        setStatusMsg("");
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── voice cancel / switch to keyboard ────────────────────────────────────
  function cancelVoice() {
    activeRef.current = false;
    cancelTTSRef.current?.();
    cancelSTTRef.current?.();
    activeRef.current = true;
    setStep("keyboard_only");
  }

  function restartVoice() {
    if (!voiceAvailable) return;
    activeRef.current = true;
    retryCountRef.current = 0;
    setServerError("");
    go("idle");
  }

  function reSpeak(s: Step) {
    if (!voiceAvailable) return;
    activeRef.current = true;
    window.speechSynthesis.cancel();
    go(s);
  }

  // ── keyboard form submit ──────────────────────────────────────────────────
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setServerError("");
    if (!email.trim() || !password.trim()) {
      setFormError("Please enter your email and password.");
      return;
    }
    setStep("logging_in");
    pendingEmail.current    = email.trim();
    pendingPassword.current = password;
    try {
      await login(email.trim(), password);
      navigate("/dashboard");
    } catch {
      // Generic message — never expose which field was wrong
      const msg = "The email address or password is incorrect.";
      setServerError(msg);
      setStep("keyboard_only");
    }
  }

  const busy = step === "logging_in" || step === "done";
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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">
            {voiceAvailable
              ? "Voice guides you — speak when prompted, or type below."
              : "Enter your credentials to sign in."}
          </p>

          {/* ── unsupported browser notice ──────────────────────────────── */}
          {!voiceAvailable && (
            <p className="voice-unavailable-notice" role="note">
              {!ttsOk && !sttOk
                ? "Voice features are not available in this browser. Please use Chrome or Edge for voice interaction."
                : !sttOk
                ? "Speech input is not supported in this browser. Please use Chrome or Edge for voice interaction."
                : "Text-to-speech is not supported in this browser."}
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

          {/* ── restart voice button ──────────────────────────────────── */}
          {voiceAvailable && step === "keyboard_only" && (
            <button
              type="button"
              className="voice-restart-btn"
              onClick={restartVoice}
              aria-label="Restart voice-guided sign in"
            >
              🎤 Restart Voice Mode
            </button>
          )}

          {/* ── server error ─────────────────────────────────────────── */}
          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}

          {/* ── form validation error ─────────────────────────────────── */}
          {formError && (
            <p className="auth-error-banner" role="alert">{formError}</p>
          )}

          <form className="auth-form" onSubmit={handleManualSubmit} noValidate>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email address</label>
              <div className="voice-field-row">
                <input
                  id="login-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={busy}
                  placeholder="Auto-filled by voice, or type here"
                  autoFocus
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
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    id="login-password"
                    type={showPwd ? "text" : "password"}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={busy}
                    placeholder="Auto-filled by voice, or type here"
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
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="auth-alt-link">
            New to VISION? <Link to="/register">Create a free account</Link>
          </p>
        </div>
      </main>

      <footer className="site-footer" role="contentinfo">
        <p>VISION Adaptive Learning Platform</p>
      </footer>
    </div>
  );
}

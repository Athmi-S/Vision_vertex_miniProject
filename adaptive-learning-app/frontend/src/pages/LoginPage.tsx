/**
 * LoginPage.tsx — Accessible login form with full voice input support.
 *
 * Voice flow:
 *  1. Page loads → TTS announces "Welcome back. Login page."
 *  2. "Speak Email" button → TTS prompts → user speaks → TTS reads back →
 *     user says yes/no to confirm → field filled automatically
 *  3. Password: three options offered:
 *     a) Speak a PIN  → user says "1 2 3 4" → stored as "1234" (pin mode)
 *     b) Type it      → normal keyboard input
 *     c) Show/hide toggle for sighted helpers
 *
 * Keyboard / screen reader accessibility is fully preserved alongside voice.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useVoiceInput } from "../hooks/useVoiceInput";
import "./AuthForm.css";

// Speak helper (standalone, no hook needed)
function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92; u.pitch = 1; u.volume = 1;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  window.speechSynthesis.speak(u);
}

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [emailError, setEmailError]     = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Which field the voice input hook is currently filling
  const [voiceTarget, setVoiceTarget] = useState<"email" | "password" | null>(null);

  // Voice input hook (shared for email + password)
  const voiceEmail    = useVoiceInput();
  const voicePassword = useVoiceInput();

  // Announce page on mount
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    const timer = setTimeout(() =>
      speak(
        "Welcome back. Login page. " +
        "You can type your details, or press the microphone buttons to use your voice. " +
        "Press Tab to move between fields."
      ), 600);
    return () => clearTimeout(timer);
  }, []);

  // When voice email is confirmed → fill the field
  useEffect(() => {
    if (voiceEmail.phase === "confirmed" && voiceEmail.value) {
      setEmail(voiceEmail.value);
      setEmailError("");
      setVoiceTarget(null);
      speak("Email address set. Moving to password.");
    }
  }, [voiceEmail.phase, voiceEmail.value]);

  // When voice password is confirmed → fill the field
  useEffect(() => {
    if (voicePassword.phase === "confirmed" && voicePassword.value) {
      setPassword(voicePassword.value);
      setPasswordError("");
      setVoiceTarget(null);
      speak("Password set. Press Enter or Tab to Sign In.");
    }
  }, [voicePassword.phase, voicePassword.value]);

  // -------------------------------------------------------------------------
  // Voice button handlers
  // -------------------------------------------------------------------------
  function handleVoiceEmail() {
    setVoiceTarget("email");
    voiceEmail.start(
      "Please say your email address. For example: athmi at gmail dot com.",
      "email"
    );
  }

  function handleVoicePassword() {
    setVoiceTarget("password");
    speak(
      "For your password, say your digits one at a time. For example: 1 2 3 4 5 6 7 8. " +
      "Say your PIN now.",
      () => voicePassword.start("Say your PIN digits now.", "pin")
    );
  }

  function cancelVoice() {
    voiceEmail.cancel();
    voicePassword.cancel();
    setVoiceTarget(null);
    speak("Voice input cancelled.");
  }

  // -------------------------------------------------------------------------
  // Validation + submit
  // -------------------------------------------------------------------------
  function validate(): boolean {
    let valid = true;
    setEmailError("");
    setPasswordError("");
    if (!email.trim()) {
      setEmailError("Email address is required.");
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address.");
      valid = false;
    }
    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setServerError(msg);
      speak(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Voice status label shown in the UI while voice is active
  // -------------------------------------------------------------------------
  function voiceStatusText(): string {
    const hook = voiceTarget === "email" ? voiceEmail : voicePassword;
    if (!voiceTarget) return "";
    switch (hook.phase) {
      case "prompting":   return "Speaking prompt…";
      case "listening":   return "🎤 Listening… speak now";
      case "confirming":  return `I heard: "${hook.rawTranscript}" — say yes or no`;
      case "confirmed":   return "✅ Confirmed!";
      case "error":       return hook.error;
      default:            return "";
    }
  }

  const isVoiceActive = voiceTarget !== null &&
    (voiceEmail.phase !== "idle" || voicePassword.phase !== "idle");

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
          <p className="auth-subtitle">Sign in to continue your learning journey.</p>

          {/* Voice mode status banner */}
          {isVoiceActive && (
            <div
              className="voice-status-banner"
              role="status"
              aria-live="assertive"
              aria-atomic="true"
            >
              <span className="voice-status-icon" aria-hidden="true">🎙️</span>
              <span>{voiceStatusText()}</span>
              <button
                type="button"
                className="voice-cancel-btn"
                onClick={cancelVoice}
                aria-label="Cancel voice input"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Server error banner */}
          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Login form"
          >
            {/* ── Email ── */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Email address
              </label>
              <div className="voice-field-row">
                <input
                  id="login-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={emailError ? "true" : "false"}
                  aria-describedby={emailError ? "login-email-error" : "login-email-hint"}
                  disabled={loading || isVoiceActive}
                  placeholder="Type or use the mic button"
                />
                <button
                  type="button"
                  className="voice-field-btn"
                  onClick={handleVoiceEmail}
                  disabled={loading || isVoiceActive}
                  aria-label="Speak your email address"
                  title="Speak your email"
                >
                  🎤
                </button>
              </div>
              <span id="login-email-hint" className="field-hint">
                Press 🎤 to say your email address aloud
              </span>
              {emailError && (
                <span id="login-email-error" className="field-error" role="alert">
                  {emailError}
                </span>
              )}
            </div>

            {/* ── Password ── */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    aria-required="true"
                    aria-invalid={passwordError ? "true" : "false"}
                    aria-describedby={
                      passwordError ? "login-password-error" : "login-password-hint"
                    }
                    disabled={loading || isVoiceActive}
                    placeholder="Type or use the mic button"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
                <button
                  type="button"
                  className="voice-field-btn"
                  onClick={handleVoicePassword}
                  disabled={loading || isVoiceActive}
                  aria-label="Speak your password as a PIN"
                  title="Speak password as PIN digits"
                >
                  🎤
                </button>
              </div>
              <span id="login-password-hint" className="field-hint">
                Press 🎤 to say your PIN digits aloud (e.g. "1 2 3 4 5 6 7 8")
              </span>
              {passwordError && (
                <span id="login-password-error" className="field-error" role="alert">
                  {passwordError}
                </span>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || isVoiceActive}
              aria-busy={loading}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="auth-alt-link">
            New to VISION?{" "}
            <Link to="/register">Create a free account</Link>
          </p>
        </div>
      </main>

      <footer className="site-footer" role="contentinfo">
        <p>VISION Adaptive Learning Platform</p>
      </footer>
    </div>
  );
}

export default LoginPage;

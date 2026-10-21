/**
 * LoginPage.tsx — Fully voice-driven login for visually impaired users.
 *
 * Auto-voice flow (no button clicks needed):
 *  1. Page loads → TTS: "Welcome back. Login page."
 *  2. TTS automatically prompts for email → mic opens → user speaks
 *  3. TTS reads back email → user says yes/no
 *  4. On yes → TTS automatically prompts for password → mic opens → user speaks
 *  5. TTS reads back password digits → user says yes/no
 *  6. On yes → form submits automatically
 *
 * Manual mode still available: type in fields + click Sign In.
 * 🎤 buttons next to fields let user re-trigger voice for that field.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useVoiceInput } from "../hooks/useVoiceInput";
import "./AuthForm.css";

// Standalone TTS helper
function tts(text: string, onEnd?: () => void) {
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

  // Which field voice is currently filling
  const [voiceTarget, setVoiceTarget] = useState<"email" | "password" | null>(null);

  const voiceEmail    = useVoiceInput();
  const voicePassword = useVoiceInput();

  // Refs to hold latest email/password so submit can read them from callbacks
  const emailRef    = useRef("");
  const passwordRef = useRef("");
  useEffect(() => { emailRef.current = email; }, [email]);
  useEffect(() => { passwordRef.current = password; }, [password]);

  // -------------------------------------------------------------------------
  // Auto-start voice for email on mount
  // -------------------------------------------------------------------------
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    const timer = setTimeout(() => {
      tts(
        "Welcome back. Login page. " +
        "Please say your email address after the beep. " +
        "For example: athmi at gmail dot com.",
        () => {
          // Auto-start email voice input right after announcement
          setVoiceTarget("email");
          voiceEmail.start(
            "Please say your email address. For example: athmi at gmail dot com.",
            "email"
          );
        }
      );
    }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Email confirmed → auto-start password voice
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (voiceEmail.phase === "confirmed" && voiceEmail.value) {
      setEmail(voiceEmail.value);
      emailRef.current = voiceEmail.value;
      setEmailError("");
      setVoiceTarget(null);

      // Automatically move to password — no button click needed
      setTimeout(() => {
        tts(
          "Email confirmed. Now please say your password digits one at a time. " +
          "For example: 1 2 3 4 5 6 7 8.",
          () => {
            setVoiceTarget("password");
            voicePassword.start(
              "Say your password digits one at a time.",
              "pin"
            );
          }
        );
      }, 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEmail.phase, voiceEmail.value]);

  // -------------------------------------------------------------------------
  // Password confirmed → auto-submit
  // -------------------------------------------------------------------------
  const autoSubmit = useCallback(async (emailVal: string, passwordVal: string) => {
    setVoiceTarget(null);
    setServerError("");
    setLoading(true);
    try {
      await login(emailVal, passwordVal);
      // Navigate INSIDE the tts onEnd callback so we wait for speech to finish
      tts("Password confirmed. Login successful. Going to your dashboard now.", () => {
        navigate("/dashboard");
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setServerError(msg);
      setLoading(false);
      tts(`Login failed. ${msg}. Please try again.`);
    }
  }, [login, navigate]);

  useEffect(() => {
    if (voicePassword.phase === "confirmed" && voicePassword.value) {
      setPassword(voicePassword.value);
      passwordRef.current = voicePassword.value;
      setPasswordError("");
      // Auto-submit using the refs (always current values)
      autoSubmit(emailRef.current, voicePassword.value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voicePassword.phase, voicePassword.value]);

  // -------------------------------------------------------------------------
  // Manual 🎤 button handlers (re-trigger voice for a specific field)
  // -------------------------------------------------------------------------
  function handleVoiceEmail() {
    voicePassword.cancel();
    setVoiceTarget("email");
    voiceEmail.start(
      "Please say your email address. For example: athmi at gmail dot com.",
      "email"
    );
  }

  function handleVoicePassword() {
    setVoiceTarget("password");
    tts(
      "Please say your password digits one at a time. For example: 1 2 3 4 5 6 7 8.",
      () => voicePassword.start("Say your password digits now.", "pin")
    );
  }

  function cancelVoice() {
    voiceEmail.cancel();
    voicePassword.cancel();
    setVoiceTarget(null);
    tts("Voice input cancelled. You can type your details manually.");
  }

  // -------------------------------------------------------------------------
  // Manual form submit (typed input)
  // -------------------------------------------------------------------------
  function validate(): boolean {
    let valid = true;
    setEmailError(""); setPasswordError("");
    if (!email.trim()) {
      setEmailError("Email address is required."); valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address."); valid = false;
    }
    if (!password) {
      setPasswordError("Password is required."); valid = false;
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
      tts(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Voice status banner text
  // -------------------------------------------------------------------------
  function voiceStatusText(): string {
    const hook = voiceTarget === "email" ? voiceEmail : voicePassword;
    if (!voiceTarget) return "";
    switch (hook.phase) {
      case "prompting":  return "Speaking prompt…";
      case "listening":  return "🎤 Listening… speak now";
      case "confirming": return `I heard: "${hook.rawTranscript}" — say yes or no`;
      case "confirmed":  return "✅ Confirmed!";
      case "error":      return hook.error || "Error. Please try again.";
      default:           return "Preparing…";
    }
  }

  const isVoiceActive = voiceTarget !== null && (
    voiceEmail.phase    !== "idle" ||
    voicePassword.phase !== "idle"
  );

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

          {/* Voice status banner */}
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

          {/* Server error */}
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
                  placeholder="Say your email or type here"
                />
                <button
                  type="button"
                  className="voice-field-btn"
                  onClick={handleVoiceEmail}
                  disabled={loading || isVoiceActive}
                  aria-label="Speak your email address"
                  title="Speak email"
                >
                  🎤
                </button>
              </div>
              <span id="login-email-hint" className="field-hint">
                Voice starts automatically — or press 🎤 to speak your email
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
                    placeholder="Say your PIN or type here"
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
                  aria-label="Speak your password as PIN digits"
                  title="Speak password"
                >
                  🎤
                </button>
              </div>
              <span id="login-password-hint" className="field-hint">
                Spoken automatically after email — or press 🎤 to re-speak
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

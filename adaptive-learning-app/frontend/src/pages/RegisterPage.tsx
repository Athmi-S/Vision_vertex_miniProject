/**
 * RegisterPage.tsx — Accessible registration form with full voice input support.
 *
 * Voice flow:
 *  1. Page loads → TTS announces "Create your account. Registration page."
 *  2. 🎤 on Username → speak username → TTS reads back → yes/no confirm
 *  3. 🎤 on Email    → speak email    → TTS spells it back → yes/no confirm
 *  4. 🎤 on Password → speak PIN digits → TTS reads digits back → yes/no confirm
 *
 * Keyboard / screen reader accessibility fully preserved alongside voice.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useVoiceInput } from "../hooks/useVoiceInput";
import "./AuthForm.css";

// Standalone speak helper
function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92; u.pitch = 1; u.volume = 1;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  window.speechSynthesis.speak(u);
}

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername]         = useState("");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError]   = useState("");
  const [successMsg, setSuccessMsg]     = useState("");
  const [loading, setLoading]           = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError]       = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Which field voice is filling right now
  const [voiceTarget, setVoiceTarget] = useState<"username" | "email" | "password" | null>(null);

  // One voice input hook per field
  const voiceUsername = useVoiceInput();
  const voiceEmail    = useVoiceInput();
  const voicePassword = useVoiceInput();

  // Announce page on mount
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    const timer = setTimeout(() =>
      speak(
        "Create your account. Registration page. " +
        "You can type your details, or press the microphone buttons to use your voice. " +
        "There are three fields: username, email address, and password. " +
        "Press Tab to move between fields."
      ), 600);
    return () => clearTimeout(timer);
  }, []);

  // username confirmed
  useEffect(() => {
    if (voiceUsername.phase === "confirmed" && voiceUsername.value) {
      setUsername(voiceUsername.value);
      setUsernameError("");
      setVoiceTarget(null);
      speak("Username set. Moving to email address.");
    }
  }, [voiceUsername.phase, voiceUsername.value]);

  // email confirmed
  useEffect(() => {
    if (voiceEmail.phase === "confirmed" && voiceEmail.value) {
      setEmail(voiceEmail.value);
      setEmailError("");
      setVoiceTarget(null);
      speak("Email address set. Moving to password.");
    }
  }, [voiceEmail.phase, voiceEmail.value]);

  // password confirmed
  useEffect(() => {
    if (voicePassword.phase === "confirmed" && voicePassword.value) {
      setPassword(voicePassword.value);
      setPasswordError("");
      setVoiceTarget(null);
      speak("Password set. Press Enter or Tab to create your account.");
    }
  }, [voicePassword.phase, voicePassword.value]);

  // -------------------------------------------------------------------------
  // Voice button handlers
  // -------------------------------------------------------------------------
  function handleVoiceUsername() {
    setVoiceTarget("username");
    voiceUsername.start(
      "Please say your username. Use letters and numbers only. For example: athmi123.",
      "username"
    );
  }

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
      "For your password, say your digits one at a time. " +
      "Your password must be at least 8 digits long. " +
      "For example: 1 2 3 4 5 6 7 8. Say your PIN now.",
      () => voicePassword.start("Say your PIN digits now, one at a time.", "pin")
    );
  }

  function cancelVoice() {
    voiceUsername.cancel();
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
    setUsernameError(""); setEmailError(""); setPasswordError("");

    if (!username.trim()) {
      setUsernameError("Username is required."); valid = false;
    } else if (username.trim().length < 3) {
      setUsernameError("Username must be at least 3 characters."); valid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setUsernameError("Username may only contain letters, numbers, and underscores."); valid = false;
    }
    if (!email.trim()) {
      setEmailError("Email address is required."); valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address."); valid = false;
    }
    if (!password) {
      setPasswordError("Password is required."); valid = false;
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters."); valid = false;
    } else if (!/\d/.test(password)) {
      setPasswordError("Password must contain at least one number."); valid = false;
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(""); setSuccessMsg("");
    if (!validate()) return;
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      setSuccessMsg("Account created! Redirecting to login…");
      speak("Account created successfully. Redirecting to login.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      setServerError(msg);
      speak(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Voice status text
  // -------------------------------------------------------------------------
  function voiceStatusText(): string {
    const hook =
      voiceTarget === "username" ? voiceUsername :
      voiceTarget === "email"    ? voiceEmail    : voicePassword;
    if (!voiceTarget) return "";
    switch (hook.phase) {
      case "prompting":  return "Speaking prompt…";
      case "listening":  return "🎤 Listening… speak now";
      case "confirming": return `I heard: "${hook.rawTranscript}" — say yes or no`;
      case "confirmed":  return "✅ Confirmed!";
      case "error":      return hook.error;
      default:           return "";
    }
  }

  const isVoiceActive = voiceTarget !== null && (
    voiceUsername.phase !== "idle" ||
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            Join VISION and start your personalised learning journey.
          </p>

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

          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}
          {successMsg && (
            <p className="auth-success-banner" role="status" aria-live="polite">
              {successMsg}
            </p>
          )}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Registration form"
          >
            {/* ── Username ── */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">Username</label>
              <div className="voice-field-row">
                <input
                  id="reg-username"
                  type="text"
                  className="form-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  aria-required="true"
                  aria-invalid={usernameError ? "true" : "false"}
                  aria-describedby={usernameError ? "reg-username-error" : "reg-username-hint"}
                  disabled={loading || isVoiceActive}
                  placeholder="Type or use the mic button"
                />
                <button
                  type="button"
                  className="voice-field-btn"
                  onClick={handleVoiceUsername}
                  disabled={loading || isVoiceActive}
                  aria-label="Speak your username"
                  title="Speak your username"
                >
                  🎤
                </button>
              </div>
              <span id="reg-username-hint" className="field-hint">
                Letters, numbers, underscores. Min 3 characters. Press 🎤 to speak.
              </span>
              {usernameError && (
                <span id="reg-username-error" className="field-error" role="alert">
                  {usernameError}
                </span>
              )}
            </div>

            {/* ── Email ── */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email address</label>
              <div className="voice-field-row">
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={emailError ? "true" : "false"}
                  aria-describedby={emailError ? "reg-email-error" : "reg-email-hint"}
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
              <span id="reg-email-hint" className="field-hint">
                Press 🎤 to say your email address aloud
              </span>
              {emailError && (
                <span id="reg-email-error" className="field-error" role="alert">
                  {emailError}
                </span>
              )}
            </div>

            {/* ── Password ── */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-required="true"
                    aria-invalid={passwordError ? "true" : "false"}
                    aria-describedby={
                      passwordError ? "reg-password-error" : "reg-password-hint"
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
                  aria-label="Speak your password as PIN digits"
                  title="Speak password as PIN digits"
                >
                  🎤
                </button>
              </div>
              <span id="reg-password-hint" className="field-hint">
                Min 8 characters with at least one number. Press 🎤 to say digits aloud.
              </span>
              {passwordError && (
                <span id="reg-password-error" className="field-error" role="alert">
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
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="auth-alt-link">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>

      <footer className="site-footer" role="contentinfo">
        <p>VISION Adaptive Learning Platform</p>
      </footer>
    </div>
  );
}

export default RegisterPage;

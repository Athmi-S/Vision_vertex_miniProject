/**
 * LoginPage.tsx — Simple, reliable login form for visually impaired users.
 *
 * Design:
 *  - Page loads → TTS announces the page
 *  - User types email + password (or uses 🎤 per field)
 *  - Click Sign In → goes to dashboard
 *  - Voice is OPTIONAL, not mandatory — keeps the flow reliable
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthForm.css";

function tts(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92; u.pitch = 1; u.volume = 1;
  if (onEnd) { u.onend = onEnd; u.onerror = () => onEnd(); }
  window.speechSynthesis.speak(u);
}

function LoginPage() {
  const navigate    = useNavigate();
  const { login }   = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [emailError, setEmailError]     = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Announce page once on mount
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    setTimeout(() =>
      tts("Welcome back. Login page. Enter your email and password, then press Sign In."),
    600);
  }, []);

  // -------------------------------------------------------------------------
  // Validate fields
  // -------------------------------------------------------------------------
  function validate(): boolean {
    let valid = true;
    setEmailError(""); setPasswordError("");
    if (!email.trim()) {
      setEmailError("Email is required."); valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address."); valid = false;
    }
    if (!password) {
      setPasswordError("Password is required."); valid = false;
    }
    return valid;
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setLoading(true);
    try {
      await login(email.trim(), password);
      // Small pause so React state settles, then navigate
      setTimeout(() => navigate("/dashboard"), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setServerError(msg);
      tts(`Login failed. ${msg}`);
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Voice input for a field — speak into the field
  // -------------------------------------------------------------------------
  function speakField(
    fieldSetter: (v: string) => void,
    prompt: string,
    type: "email" | "text"
  ) {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { tts("Speech recognition not supported. Please type."); return; }

    tts(prompt, () => {
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 3;

      rec.onresult = (event: any) => {
        let raw = event.results[0][0].transcript.trim();
        if (type === "email") {
          raw = raw.toLowerCase()
            .replace(/\s+at\s+/gi, "@")
            .replace(/\s+dot\s+/gi, ".")
            .replace(/\s/g, "");
        }
        fieldSetter(raw);
        tts(`I heard: ${raw}. If correct, press Sign In. Press the mic button again to redo.`);
      };
      rec.onerror = () => tts("Could not hear you. Please try again.");
      rec.start();
    });
  }

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

          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Login form"
          >
            {/* Email */}
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
                  aria-describedby={emailError ? "login-email-err" : "login-email-hint"}
                  disabled={loading}
                  placeholder="Type or press 🎤"
                  autoFocus
                />
                <button
                  type="button"
                  className="voice-field-btn"
                  onClick={() =>
                    speakField(
                      setEmail,
                      "Please say your email address. For example: athmi at gmail dot com.",
                      "email"
                    )
                  }
                  disabled={loading}
                  aria-label="Speak your email address"
                >
                  🎤
                </button>
              </div>
              <span id="login-email-hint" className="field-hint">
                Press 🎤 to speak your email, or type it
              </span>
              {emailError && (
                <span id="login-email-err" className="field-error" role="alert">
                  {emailError}
                </span>
              )}
            </div>

            {/* Password */}
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
                      passwordError ? "login-pwd-err" : "login-pwd-hint"
                    }
                    disabled={loading}
                    placeholder="Type or press 🎤"
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
                  onClick={() =>
                    speakField(
                      setPassword,
                      "Please say your password digits one at a time. For example: 1 2 3 4 5 6 7 8.",
                      "text"
                    )
                  }
                  disabled={loading}
                  aria-label="Speak your password digits"
                >
                  🎤
                </button>
              </div>
              <span id="login-pwd-hint" className="field-hint">
                Press 🎤 to speak PIN digits, or type your password
              </span>
              {passwordError && (
                <span id="login-pwd-err" className="field-error" role="alert">
                  {passwordError}
                </span>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
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

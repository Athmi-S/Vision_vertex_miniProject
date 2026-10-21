/**
 * RegisterPage.tsx — Functional learner registration form.
 *
 * Accessibility:
 *  - Semantic <form>, <label>, <input> elements with explicit htmlFor/id links
 *  - aria-invalid on inputs with errors
 *  - aria-describedby links inputs to their error messages
 *  - role="alert" on banners (announced immediately by screen readers)
 *  - Skip link, landmark regions, visible focus ring (global in App.css)
 *  - Password show/hide toggle with descriptive aria-label
 *  - Password requirements listed upfront so screen reader users know them
 *  - Keyboard navigable — no mouse required
 *  - Loading state disables submit and shows feedback
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthForm.css";

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Field-level errors
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function validate(): boolean {
    let valid = true;
    setUsernameError("");
    setEmailError("");
    setPasswordError("");

    if (!username.trim()) {
      setUsernameError("Username is required.");
      valid = false;
    } else if (username.trim().length < 3) {
      setUsernameError("Username must be at least 3 characters.");
      valid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setUsernameError("Username may only contain letters, numbers, and underscores.");
      valid = false;
    }
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
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    } else if (!/\d/.test(password)) {
      setPasswordError("Password must contain at least one number.");
      valid = false;
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    setSuccessMsg("");
    if (!validate()) return;

    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      setSuccessMsg(
        "Account created! Redirecting to login…"
      );
      setTimeout(() => navigate("/login"), 1500);
    } catch (err: unknown) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className="site-header" role="banner">
        <nav aria-label="Site navigation" className="site-nav">
          <span className="site-logo" aria-hidden="true">🎓</span>
          <span className="site-name">VISION Learning</span>
        </nav>
      </header>

      {/* Main */}
      <main id="main-content" className="auth-main" tabIndex={-1}>
        <div className="auth-card">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            Join VISION and start your personalised learning journey.
          </p>

          {/* Banners */}
          {serverError && (
            <p className="auth-error-banner" role="alert">
              {serverError}
            </p>
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
            {/* Username */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">
                Username
              </label>
              <input
                id="reg-username"
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                aria-required="true"
                aria-invalid={usernameError ? "true" : "false"}
                aria-describedby={
                  usernameError ? "reg-username-error" : "reg-username-hint"
                }
                disabled={loading}
              />
              <span id="reg-username-hint" className="field-error" style={{ color: "var(--colour-muted)", fontWeight: "normal" }}>
                Letters, numbers, and underscores only. Min 3 characters.
              </span>
              {usernameError && (
                <span id="reg-username-error" className="field-error" role="alert">
                  {usernameError}
                </span>
              )}
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-required="true"
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "reg-email-error" : undefined}
                disabled={loading}
              />
              {emailError && (
                <span id="reg-email-error" className="field-error" role="alert">
                  {emailError}
                </span>
              )}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">
                Password
              </label>
              <div className="password-wrapper">
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
                  disabled={loading}
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
              <span id="reg-password-hint" className="field-error" style={{ color: "var(--colour-muted)", fontWeight: "normal" }}>
                Min 8 characters, including at least one number.
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
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          {/* Link to login */}
          <p className="auth-alt-link">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="site-footer" role="contentinfo">
        <p>
          VISION Adaptive Learning Platform
        </p>
      </footer>
    </div>
  );
}

export default RegisterPage;

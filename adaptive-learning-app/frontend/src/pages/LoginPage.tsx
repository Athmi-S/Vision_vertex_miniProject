/**
 * LoginPage.tsx — Functional learner login form.
 *
 * Accessibility:
 *  - Semantic <form>, <label>, <input> elements with explicit htmlFor/id links
 *  - aria-invalid on inputs with errors
 *  - aria-describedby links inputs to their error messages
 *  - role="alert" on server error banner (announced immediately)
 *  - Skip link, landmark regions, visible focus ring (global in App.css)
 *  - Password show/hide toggle with descriptive aria-label
 *  - Keyboard navigable — no mouse required
 *  - Loading state disables submit and shows feedback
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthForm.css";

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  // Field-level validation errors
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

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
      setServerError(
        err instanceof Error ? err.message : "Login failed. Please try again."
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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">
            Sign in to continue your learning journey.
          </p>

          {/* Server error banner */}
          {serverError && (
            <p className="auth-error-banner" role="alert">
              {serverError}
            </p>
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
              <input
                id="login-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-required="true"
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "login-email-error" : undefined}
                disabled={loading}
              />
              {emailError && (
                <span
                  id="login-email-error"
                  className="field-error"
                  role="alert"
                >
                  {emailError}
                </span>
              )}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <div className="password-wrapper">
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
                    passwordError ? "login-password-error" : undefined
                  }
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={0}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
              {passwordError && (
                <span
                  id="login-password-error"
                  className="field-error"
                  role="alert"
                >
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

          {/* Link to register */}
          <p className="auth-alt-link">
            New to VISION?{" "}
            <Link to="/register">Create a free account</Link>
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

export default LoginPage;

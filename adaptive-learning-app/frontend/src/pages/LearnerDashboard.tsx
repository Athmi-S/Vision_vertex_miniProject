/**
 * LearnerDashboard.tsx — Protected dashboard page.
 *
 * Stage 2: session check, welcome message, logout.
 * Stage 5 (Step D): shows the learner's current learning mode (from GET /profile)
 * and a navigation link to /mode-select.
 *
 * Route protection: calls GET /auth/me on mount. Redirects to /login if the
 * session cookie is absent or expired. Backend also enforces auth on any
 * protected API calls — frontend protection alone is not sufficient.
 */

import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import "./PlaceholderPage.css";

/** Human-readable label for a learning mode value. */
const MODE_LABELS: Record<string, string> = {
  academic: "Academic Learning",
  competitive: "Competitive Exam Preparation",
  topic: "Specific-Topic Learning",
};

function LearnerDashboard() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const { profile, fetchProfile } = useProfile();

  // Redirect to login if not authenticated after session check completes
  useEffect(() => {
    if (!loading && user === null) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  // Load profile once session is confirmed
  useEffect(() => {
    if (!loading && user !== null) {
      fetchProfile();
    }
  }, [loading, user, fetchProfile]);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  // Show nothing while the session check is in progress
  if (loading) {
    return (
      <div className="placeholder-page">
        <header className="site-header" role="banner">
          <nav aria-label="Site navigation" className="site-nav">
            <span className="site-logo" aria-hidden="true">🎓</span>
            <span className="site-name">VISION Learning</span>
          </nav>
        </header>
        <main className="placeholder-main" tabIndex={-1}>
          <p style={{ textAlign: "center", color: "var(--colour-muted)" }}>
            Checking session…
          </p>
        </main>
      </div>
    );
  }

  // If user is null here, useEffect above will redirect — render nothing
  if (!user) return null;

  return (
    <div className="placeholder-page">
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className="site-header" role="banner">
        <nav
          aria-label="Site navigation"
          className="site-nav"
          style={{ justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="site-logo" aria-hidden="true">🎓</span>
            <span className="site-name">VISION Learning</span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.4)",
              color: "#fff",
              borderRadius: "4px",
              padding: "0.3rem 0.9rem",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
            aria-label="Log out of VISION"
          >
            Log out
          </button>
        </nav>
      </header>

      {/* Main */}
      <main id="main-content" className="placeholder-main" tabIndex={-1}>
        <div
          className="placeholder-card"
          role="region"
          aria-labelledby="dashboard-heading"
        >
          <span className="placeholder-icon" aria-hidden="true">📊</span>

          <h1 id="dashboard-heading" className="placeholder-title">
            Welcome, {user.username}!
          </h1>

          <p
            className="placeholder-notice"
            role="status"
            aria-live="polite"
            style={{ background: "#e8f5e9", color: "#1b5e20", borderColor: "#a5d6a7" }}
          >
            ✅ You are logged in as <strong>{user.email}</strong>
          </p>

          {/* Learning mode display */}
          <div
            style={{
              margin: "1.25rem 0",
              padding: "1rem 1.25rem",
              border: "1px solid var(--colour-border)",
              borderRadius: "6px",
              background: "var(--colour-surface)",
              textAlign: "left",
            }}
          >
            <p style={{ fontWeight: 700, marginBottom: "0.3rem" }}>
              Learning Mode
            </p>
            <p style={{ color: "var(--colour-muted)", fontSize: "0.95rem" }}>
              {profile === null
                ? "Loading…"
                : profile.learning_mode
                ? MODE_LABELS[profile.learning_mode] ?? profile.learning_mode
                : "Not selected yet"}
            </p>
          </div>

          {/* Action buttons row */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
            {/* Navigate to mode selector */}
            <Link
              to="/mode-select"
              style={{
                display: "inline-block",
                background: "var(--colour-primary)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "0.7rem 1.4rem",
                borderRadius: "5px",
                textDecoration: "none",
                letterSpacing: "0.03em",
              }}
              aria-label="Choose or change your learning mode"
            >
              {profile?.learning_mode ? "Change Learning Mode" : "Choose Learning Mode"}
            </Link>

            {/* Start assessment — only shown after a mode is selected */}
            {profile?.learning_mode && (
              <Link
                to="/diagnostic"
                style={{
                  display: "inline-block",
                  background: "transparent",
                  color: "var(--colour-primary)",
                  fontWeight: 700,
                  fontSize: "1rem",
                  padding: "0.7rem 1.4rem",
                  borderRadius: "5px",
                  textDecoration: "none",
                  border: "2px solid var(--colour-primary)",
                  letterSpacing: "0.03em",
                }}
                aria-label="Start a diagnostic assessment"
              >
                Start Assessment
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="site-footer" role="contentinfo">
        <p>
          VISION — Third-Year AIML Engineering Project &nbsp;|&nbsp; 4SF24CI033
        </p>
      </footer>
    </div>
  );
}

export default LearnerDashboard;

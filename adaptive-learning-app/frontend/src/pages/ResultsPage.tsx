/**
 * ResultsPage.tsx — Session summary and topic mastery display.
 *
 * Route: /result/:sessionId
 *
 * Fetches GET /assessment/result/{session_id} on mount using the sessionId
 * URL parameter. All displayed values come directly from the API response —
 * no scores or mastery values are hardcoded or invented.
 *
 * Accessibility:
 *  - Summary statistics in a landmark region with aria-label
 *  - Topic mastery table with proper <th scope="col"> headers
 *  - Mastery bars are decorative (aria-hidden) — the numeric value is also shown
 *  - role="alert" on error; aria-live on loading status
 *  - Skip link, landmark regions, keyboard-navigable buttons
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { SessionResult, TopicMastery } from "../hooks/useAssessment";
import "./ResultsPage.css";

const API = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader({ onLogout }: { onLogout: () => void }) {
  return (
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
          onClick={onLogout}
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
  );
}

function PageFooter() {
  return (
    <footer className="site-footer" role="contentinfo">
      <p>VISION — Third-Year AIML Engineering Project &nbsp;|&nbsp; 4SF24CI033</p>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Mastery bar (decorative bar + readable percentage text)
// ---------------------------------------------------------------------------
function MasteryBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div className="mastery-bar-track" aria-hidden="true">
        <div
          className="mastery-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span style={{ fontSize: "0.88rem", fontWeight: 600, minWidth: "2.5rem" }}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function ResultsPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [result, setResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && user === null) {
      navigate("/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // -------------------------------------------------------------------------
  // Fetch results from backend
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!sessionId || authLoading || user === null) return;

    setLoading(true);
    setError("");

    fetch(`${API}/assessment/result/${sessionId}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (r.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(
            body.detail ??
              "Could not load session results. The session may not exist or may not belong to you."
          );
        }
        return r.json();
      })
      .then((data: SessionResult | undefined) => {
        if (data) setResult(data);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load results."
        );
      })
      .finally(() => setLoading(false));
  }, [sessionId, authLoading, user, navigate]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  async function handleLogout() {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    navigate("/", { replace: true });
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (authLoading || loading) {
    return (
      <div className="results-page">
        <PageHeader onLogout={handleLogout} />
        <main className="results-main" tabIndex={-1}>
          <div className="results-card">
            <p
              className="results-loading-text"
              aria-live="polite"
              aria-busy="true"
            >
              Loading your results…
            </p>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  if (!user) return null;

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error || !result) {
    return (
      <div className="results-page">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <PageHeader onLogout={handleLogout} />
        <main id="main-content" className="results-main" tabIndex={-1}>
          <div className="results-card">
            <h1 className="results-title">Results Not Found</h1>
            {error && (
              <p className="results-error-banner" role="alert">
                {error}
              </p>
            )}
            <div className="results-btn-row">
              <Link to="/diagnostic" className="results-btn-primary">
                Try Another Assessment
              </Link>
              <Link to="/dashboard" className="results-btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Success state — show results
  // -------------------------------------------------------------------------
  return (
    <div className="results-page">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <PageHeader onLogout={handleLogout} />

      <main id="main-content" className="results-main" tabIndex={-1}>
        <div className="results-card">
          <h1 className="results-title">Assessment Results</h1>
          <p className="results-subtitle">{result.message}</p>

          {/* Overall score statistics */}
          <section
            aria-label="Overall score summary"
            className="results-summary"
          >
            <div className="results-stat">
              <span className="results-stat-value">
                {result.score_percent}%
              </span>
              <span className="results-stat-label">Score</span>
            </div>
            <div className="results-stat">
              <span className="results-stat-value">{result.correct}</span>
              <span className="results-stat-label">Correct</span>
            </div>
            <div className="results-stat">
              <span className="results-stat-value">
                {result.total_questions - result.correct - result.skipped}
              </span>
              <span className="results-stat-label">Incorrect</span>
            </div>
            <div className="results-stat">
              <span className="results-stat-value">{result.skipped}</span>
              <span className="results-stat-label">Skipped</span>
            </div>
          </section>

          {/* Topic mastery breakdown */}
          {result.topic_breakdown.length > 0 && (
            <section aria-label="Topic mastery breakdown">
              <h2 className="results-section-title">Topic Mastery</h2>
              <div className="results-table-wrapper">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th scope="col">Topic</th>
                      <th scope="col">Correct / Total</th>
                      <th scope="col">Mastery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.topic_breakdown.map((topic: TopicMastery) => (
                      <tr key={topic.topic_id}>
                        <td>{topic.topic_name}</td>
                        <td>
                          {topic.correct} / {topic.total}
                        </td>
                        <td>
                          <MasteryBar score={topic.mastery_score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Navigation */}
          <div className="results-btn-row">
            <Link to="/diagnostic" className="results-btn-primary">
              Start New Assessment
            </Link>
            <Link to="/dashboard" className="results-btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}

export default ResultsPage;

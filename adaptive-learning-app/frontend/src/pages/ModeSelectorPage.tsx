/**
 * ModeSelectorPage.tsx — Learning mode selection screen.
 *
 * Accessibility features:
 *  - Three mode options rendered as <label> wrappers around visually-hidden
 *    <input type="radio"> elements — full keyboard and screen-reader support.
 *  - <fieldset> + <legend> group labels the radio group semantically.
 *  - role="status" / aria-live="polite" announces save outcomes to screen readers.
 *  - role="alert" on error banners (announced immediately, not politely).
 *  - aria-busy on the confirm button while saving.
 *  - Skip link, landmark regions, visible focus ring (global in App.css).
 *  - No mouse required — fully keyboard navigable.
 *
 * Route protection:
 *  The page calls GET /auth/me (via useAuth) and GET /profile (via useProfile)
 *  on mount. If either returns 401, the user is redirected to /login.
 *  The backend independently enforces auth on every protected call.
 */

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import type { LearnerProfile } from "../hooks/useProfile";
import "./ModeSelectorPage.css";

// ---------------------------------------------------------------------------
// Mode definitions — single source of truth for labels, descriptions, icons
// ---------------------------------------------------------------------------
type ModeValue = LearnerProfile["learning_mode"]; // "academic" | "competitive" | "topic" | null

interface ModeOption {
  value: Exclude<ModeValue, null>;   // one of the three real values
  title: string;
  description: string;
  icon: string;                       // decorative emoji, aria-hidden
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "academic",
    title: "Academic Learning",
    description: "Structured study aligned with your school or college curriculum.",
    icon: "📚",
  },
  {
    value: "competitive",
    title: "Competitive Exam Prep",
    description: "Focused practice for entrance and competitive examinations.",
    icon: "🏆",
  },
  {
    value: "topic",
    title: "Specific-Topic Learning",
    description: "Deep-dive into a single subject or topic of your choice.",
    icon: "🎯",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function ModeSelectorPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const {
    profile,
    loading: profileLoading,
    saving,
    error,
    successMessage,
    fetchProfile,
    saveMode,
  } = useProfile();

  // The locally selected mode — starts as whatever is saved in the backend
  const [selectedMode, setSelectedMode] = useState<ModeValue>(null);
  // Track whether the learner has made a change from what was last saved
  const [isDirty, setIsDirty] = useState(false);

  // -------------------------------------------------------------------------
  // On mount: redirect if not authenticated, then load profile
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && user === null) {
      navigate("/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && user !== null) {
      fetchProfile();
    }
  }, [authLoading, user, fetchProfile]);

  // Once the profile loads, initialise the local selection from the saved value
  useEffect(() => {
    if (profile !== null) {
      setSelectedMode(profile.learning_mode);
      setIsDirty(false);
    }
  }, [profile]);

  // Redirect to /login if GET /profile returns 401
  useEffect(() => {
    if (error === "NOT_AUTHENTICATED") {
      navigate("/login", { replace: true });
    }
  }, [error, navigate]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  function handleModeChange(value: Exclude<ModeValue, null>) {
    setSelectedMode(value);
    setIsDirty(value !== profile?.learning_mode);
  }

  async function handleConfirm() {
    if (selectedMode === null) return;
    await saveMode(selectedMode);
    // After a successful save, isDirty resets via the profile update effect
    setIsDirty(false);
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  // Show nothing while session check is running
  if (authLoading) {
    return (
      <div className="mode-page">
        <PageHeader username={null} onLogout={() => {}} />
        <main className="mode-main" tabIndex={-1}>
          <div className="mode-card">
            <p className="mode-loading-text" aria-live="polite">
              Checking session…
            </p>
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  if (!user) return null; // redirecting

  const isLoading = profileLoading;
  const canSave = selectedMode !== null && !saving && !isLoading;

  // User-visible error (filter out the internal sentinel)
  const displayError = error && error !== "NOT_AUTHENTICATED" ? error : "";

  return (
    <div className="mode-page">
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <PageHeader username={user.username} onLogout={handleLogout} />

      <main id="main-content" className="mode-main" tabIndex={-1}>
        <div className="mode-card">
          <h1 className="mode-title">Choose Your Learning Mode</h1>
          <p className="mode-subtitle">
            Select how you want to use VISION. You can change this at any time
            from your dashboard.
          </p>

          {/* Loading state */}
          {isLoading && (
            <p className="mode-loading-text" aria-live="polite" aria-busy="true">
              Loading your profile…
            </p>
          )}

          {/* Error banner */}
          {displayError && (
            <p className="mode-error-banner" role="alert">
              {displayError}
            </p>
          )}

          {/* Success banner */}
          {successMessage && (
            <p
              className="mode-success-banner"
              role="status"
              aria-live="polite"
            >
              ✅ {successMessage}
            </p>
          )}

          {/* Mode radio group */}
          {!isLoading && (
            <fieldset className="mode-fieldset">
              <legend className="mode-legend">
                Select a learning mode:
              </legend>

              <div className="mode-options" role="radiogroup">
                {MODE_OPTIONS.map((opt) => {
                  const isSelected = selectedMode === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`mode-option-label${isSelected ? " selected" : ""}`}
                      aria-label={`${opt.title}: ${opt.description}`}
                    >
                      {/*
                        Visually hidden radio input.
                        Screen readers announce "radio button, [title], checked/unchecked".
                        Keyboard users use arrow keys to move between radios.
                      */}
                      <input
                        type="radio"
                        name="learning-mode"
                        value={opt.value}
                        checked={isSelected}
                        onChange={() => handleModeChange(opt.value)}
                        disabled={saving}
                        className="mode-option-radio"
                        aria-describedby={`mode-desc-${opt.value}`}
                      />
                      <span className="mode-option-icon" aria-hidden="true">
                        {opt.icon}
                      </span>
                      <span className="mode-option-title">{opt.title}</span>
                      <span
                        id={`mode-desc-${opt.value}`}
                        className="mode-option-desc"
                      >
                        {opt.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {/* Confirm button */}
          {!isLoading && (
            <button
              type="button"
              className="mode-confirm-btn"
              onClick={handleConfirm}
              disabled={!canSave || !isDirty}
              aria-busy={saving}
              aria-disabled={!canSave || !isDirty}
            >
              {saving
                ? "Saving…"
                : isDirty
                ? "Confirm Mode"
                : selectedMode
                ? "Mode Already Saved"
                : "Select a Mode Above"}
            </button>
          )}

          {/* Back to dashboard */}
          <div style={{ marginTop: "1rem" }}>
            <Link to="/dashboard" className="mode-back-link">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </main>

      <PageFooter />
    </div>
  );

  // -------------------------------------------------------------------------
  // Logout helper (defined inside component to access navigate)
  // -------------------------------------------------------------------------
  async function handleLogout() {
    await fetch("http://localhost:8000/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/", { replace: true });
  }
}

// ---------------------------------------------------------------------------
// Sub-components shared with LearnerDashboard pattern
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  username: string | null;
  onLogout: () => void;
}

function PageHeader({ username, onLogout }: PageHeaderProps) {
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
        {username && (
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
        )}
      </nav>
    </header>
  );
}

function PageFooter() {
  return (
    <footer className="site-footer" role="contentinfo">
      <p>
        VISION — Third-Year AIML Engineering Project &nbsp;|&nbsp; 4SF24CI033
      </p>
    </footer>
  );
}

export default ModeSelectorPage;

import { useNavigate } from "react-router-dom";
import "./WelcomePage.css";

/**
 * WelcomePage
 *
 * Accessibility considerations implemented here:
 *  - Semantic landmark elements: <header>, <main>, <footer>
 *  - <h1> as the page's single primary heading
 *  - aria-label on the nav landmark
 *  - Descriptive button text (no "click here")
 *  - High-contrast colour scheme (defined in App.css)
 *  - Keyboard-navigable without a mouse
 *  - focus-visible ring provided globally in App.css
 */
function WelcomePage() {
  const navigate = useNavigate();

  // Navigates to the login page.
  // Full authentication will be implemented in Stage 2.
  function handleStartLearning() {
    navigate("/login");
  }

  return (
    <>
      {/* ── Skip-navigation link (screen readers + keyboard users) ── */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ── Page header ── */}
      <header className="site-header" role="banner">
        <nav aria-label="Site navigation" className="site-nav">
          <span className="site-logo" aria-hidden="true">🎓</span>
          <span className="site-name">VISION Learning</span>
        </nav>
      </header>

      {/* ── Main content ── */}
      <main id="main-content" className="welcome-main" tabIndex={-1}>
        <section className="hero-section" aria-labelledby="hero-heading">
          <h1 id="hero-heading" className="hero-title">
            Behaviour-Aware Adaptive Teaching for Visually Impaired Learners
          </h1>

          <p className="hero-subtitle">
            A personalised, multilingual learning platform that adapts to your
            pace, style, and goals — supporting academic study, competitive
            examination preparation, and focused topic learning.
          </p>

          <ul className="feature-list" aria-label="Platform features">
            <li>Academic curriculum learning at your own pace</li>
            <li>Competitive examination preparation</li>
            <li>Focused single-topic deep dives</li>
            <li>Full keyboard and screen-reader support</li>
            <li>Multilingual content delivery</li>
          </ul>

          {/* Primary call-to-action */}
          <button
            className="btn-start"
            onClick={handleStartLearning}
            type="button"
            aria-describedby="start-hint"
          >
            Start Learning
          </button>
          <p id="start-hint" className="btn-hint">
            Press Enter or Space to activate after focusing this button.
          </p>

          {/* Secondary: link to registration page */}
          <p className="register-prompt">
            New here?{" "}
            <a href="/register" className="register-link">
              Create an account
            </a>
          </p>
        </section>
      </main>

      {/* ── Page footer ── */}
      <footer className="site-footer" role="contentinfo">
        <p>
          VISION Adaptive Learning Platform
        </p>
      </footer>
    </>
  );
}

export default WelcomePage;

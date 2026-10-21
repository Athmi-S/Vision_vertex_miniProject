/**
 * LoginPage.tsx — Fully hands-free login for visually impaired users.
 *
 * Auto flow (zero clicks needed):
 *  1. Page loads → TTS: "Welcome back."
 *  2. Auto mic → user says email → TTS reads back → yes/no
 *  3. Auto mic → user says password digits → TTS reads back → yes/no
 *  4. Login → TTS: "Login successful." → auto navigate to dashboard
 *
 * Manual fallback: type in fields + click Sign In.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AuthForm.css";

// ─── TTS helper ───────────────────────────────────────────────────────────────
function tts(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9; u.pitch = 1; u.volume = 1;
  u.onend   = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

// ─── STT helper ───────────────────────────────────────────────────────────────
function listenOnce(onResult: (t: string) => void, onError: () => void) {
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!SR) { onError(); return; }
  const r = new SR();
  r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 5;
  r.onresult = (e: any) => onResult(e.results[0][0].transcript.trim());
  r.onerror  = () => onError();
  r.start();
}

// ─── Normalise ────────────────────────────────────────────────────────────────
function normaliseEmail(raw: string): string {
  return raw.toLowerCase()
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s/g, "");
}

function normalisePin(raw: string): string {
  const WORD: Record<string, string> = {
    zero:"0",one:"1",two:"2",three:"3",four:"4",
    five:"5",six:"6",seven:"7",eight:"8",nine:"9",
  };
  return raw.trim().toLowerCase()
    .split(/[\s,]+/)
    .map(w => WORD[w] ?? (/^\d$/.test(w) ? w : ""))
    .filter(Boolean).join("");
}

// ─── Voice step ───────────────────────────────────────────────────────────────
type STTType = "email" | "pin";

function voiceStep(prompt: string, type: STTType, onConfirmed: (v: string) => void) {
  tts(prompt, () => {
    listenOnce(
      (transcript) => {
        const value = type === "email" ? normaliseEmail(transcript) : normalisePin(transcript);
        const label = type === "email"
          ? value.replace(/@/, " at ").replace(/\./g, " dot ")
          : value.split("").join(" ");

        tts(
          `I heard: ${label}. Say yes to confirm or no to try again.`,
          () => listenOnce(
            (answer) => {
              const yes = /\b(yes|yeah|yep|correct|right|ok|okay|confirm|sure)\b/
                .test(answer.toLowerCase());
              if (yes) onConfirmed(value);
              else voiceStep(prompt, type, onConfirmed);
            },
            () => voiceStep(prompt, type, onConfirmed)
          )
        );
      },
      () => tts("I did not hear you. Let us try again.", () =>
        voiceStep(prompt, type, onConfirmed)
      )
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
function LoginPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [emailError, setEmailError]     = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [voiceStatus, setVoiceStatus]   = useState("");

  // ── Auto voice flow on mount ──────────────────────────────────────────────
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    tts(
      "Welcome back. Login page. " +
      "I will ask for your email and password. Say each one clearly.",
      () => startVoiceFlow()
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startVoiceFlow() {
    setVoiceStatus("Listening for email…");
    voiceStep(
      "Please say your email address. For example: athmi at gmail dot com.",
      "email",
      (em) => {
        setEmail(em);
        setVoiceStatus("Email confirmed. Listening for password…");
        voiceStep(
          "Please say your password digits one at a time. For example: 1 2 3 4 5 6 7 8.",
          "pin",
          (pwd) => {
            setPassword(pwd);
            setVoiceStatus("Password confirmed. Signing in…");
            doLogin(em, pwd);
          }
        );
      }
    );
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function doLogin(em: string, pwd: string) {
    setLoading(true);
    setServerError("");
    try {
      await login(em.trim(), pwd);
      setVoiceStatus("");
      tts("Login successful. Going to your dashboard.", () => {
        navigate("/dashboard");
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setServerError(msg);
      setLoading(false);
      setVoiceStatus("");
      tts(`Login failed. ${msg}. Let us try again.`, () => startVoiceFlow());
    }
  }

  // ── Manual submit ──────────────────────────────────────────────────────────
  function validate(): boolean {
    let valid = true;
    setEmailError(""); setPasswordError("");
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
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
    doLogin(email, password);
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
          <p className="auth-subtitle">Voice will guide you — just speak when prompted.</p>

          {/* Voice status */}
          {voiceStatus && (
            <div className="voice-status-banner" role="status" aria-live="polite">
              <span aria-hidden="true">🎙️</span>
              <span>{voiceStatus}</span>
            </div>
          )}

          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-label="Login form">

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email address</label>
              <div className="voice-field-row">
                <input
                  id="login-email" type="email" className="form-input"
                  value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" aria-required="true"
                  aria-invalid={emailError ? "true" : "false"}
                  disabled={loading}
                  placeholder="Auto-filled by voice or type here"
                  autoFocus
                />
                <button type="button" className="voice-field-btn" disabled={loading}
                  aria-label="Re-speak email"
                  onClick={() => voiceStep(
                    "Please say your email address.",
                    "email",
                    v => setEmail(v)
                  )}>🎤</button>
              </div>
              {emailError && <span className="field-error" role="alert">{emailError}</span>}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" aria-required="true"
                    aria-invalid={passwordError ? "true" : "false"}
                    disabled={loading}
                    placeholder="Auto-filled by voice or type here"
                  />
                  <button type="button" className="password-toggle"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
                <button type="button" className="voice-field-btn" disabled={loading}
                  aria-label="Re-speak password"
                  onClick={() => voiceStep(
                    "Please say your password digits one at a time.",
                    "pin",
                    v => setPassword(v)
                  )}>🎤</button>
              </div>
              {passwordError && <span className="field-error" role="alert">{passwordError}</span>}
            </div>

            <button type="submit" className="auth-submit-btn"
              disabled={loading} aria-busy={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="auth-alt-link">
            New to VISION? <Link to="/register">Create a free account</Link>
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

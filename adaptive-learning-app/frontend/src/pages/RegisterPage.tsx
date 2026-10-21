/**
 * RegisterPage.tsx — Fully hands-free registration for visually impaired users.
 *
 * Auto flow (zero clicks needed):
 *  1. Page loads → TTS: "Create your account."
 *  2. Auto mic → user says username → TTS reads back → yes/no
 *  3. Auto mic → user says email → TTS reads back → yes/no
 *  4. Auto mic → user says password digits → TTS reads back → yes/no
 *  5. Account created → TTS: "Account created. Going to login." → auto redirect
 *
 * Manual fallback: type in fields + click Create Account.
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
type STTType = "email" | "pin" | "text";

function listenOnce(onResult: (t: string) => void, onError: () => void) {
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!SR) { onError(); return; }
  const r = new SR();
  r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 5;
  r.onresult = (e: any) => {
    const transcript = e.results[0][0].transcript.trim();
    onResult(transcript);
  };
  r.onerror = () => onError();
  r.start();
}

// ─── Normalise spoken input ───────────────────────────────────────────────────
function normalise(raw: string, type: STTType): string {
  if (type === "email") {
    return raw.toLowerCase()
      .replace(/\s+at\s+/gi, "@")
      .replace(/\s+dot\s+/gi, ".")
      .replace(/\s/g, "");
  }
  if (type === "pin") {
    const WORD: Record<string, string> = {
      zero:"0",one:"1",two:"2",three:"3",four:"4",
      five:"5",six:"6",seven:"7",eight:"8",nine:"9",
    };
    return raw.trim().toLowerCase()
      .split(/[\s,]+/)
      .map(w => WORD[w] ?? (/^\d$/.test(w) ? w : ""))
      .filter(Boolean).join("");
  }
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

// ─── Make value speakable ─────────────────────────────────────────────────────
function readable(value: string, type: STTType): string {
  if (type === "email")
    return value.replace(/@/, " at ").replace(/\./g, " dot ");
  if (type === "pin")
    return value.split("").join(" ");
  return value.split("").join(" ");
}

// ─── Single voice field step ──────────────────────────────────────────────────
// Speaks prompt → listens → reads back → listens for yes/no → calls onConfirmed or retries
function voiceStep(
  prompt: string,
  type: STTType,
  onConfirmed: (value: string) => void,
) {
  tts(prompt, () => {
    listenOnce(
      (transcript) => {
        const value = normalise(transcript, type);
        const label = readable(value, type);
        tts(
          `I heard: ${label}. Is this correct? Say yes to confirm or no to try again.`,
          () => {
            listenOnce(
              (answer) => {
                const a = answer.trim().toLowerCase();
                const yes = /\b(yes|yeah|yep|correct|right|ok|okay|confirm|sure)\b/.test(a);
                if (yes) {
                  onConfirmed(value);
                } else {
                  // retry
                  voiceStep(prompt, type, onConfirmed);
                }
              },
              () => voiceStep(prompt, type, onConfirmed), // mic error → retry
            );
          }
        );
      },
      () => {
        tts("I did not hear you. Let us try again.", () =>
          voiceStep(prompt, type, onConfirmed)
        );
      }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");

  // Errors for manual mode
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError]       = useState("");
  const [passwordError, setPasswordError] = useState("");

  // ── Auto voice flow on mount ──────────────────────────────────────────────
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    tts(
      "Create your account. I will ask for your username, email, and password. " +
      "Say each one clearly after you hear the prompt.",
      () => startVoiceFlow()
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startVoiceFlow() {
    // Step 1: username
    setVoiceStatus("Listening for username…");
    voiceStep(
      "Please say your username. Use letters and numbers only. For example: athmi 123.",
      "text",
      (uname) => {
        setUsername(uname);
        setVoiceStatus("Username confirmed. Listening for email…");
        // Step 2: email
        voiceStep(
          "Please say your email address. For example: athmi at gmail dot com.",
          "email",
          (em) => {
            setEmail(em);
            setVoiceStatus("Email confirmed. Listening for password…");
            // Step 3: password
            voiceStep(
              "Please say your password digits one at a time. " +
              "It must be at least 8 digits. For example: 1 2 3 4 5 6 7 8.",
              "pin",
              (pwd) => {
                setPassword(pwd);
                setVoiceStatus("Password confirmed. Creating your account…");
                // Auto submit
                submitAccount(uname, em, pwd);
              }
            );
          }
        );
      }
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submitAccount(uname: string, em: string, pwd: string) {
    setLoading(true);
    setServerError("");
    try {
      await register(uname.trim(), em.trim(), pwd);
      setSuccessMsg("Account created! Going to login…");
      setVoiceStatus("");
      tts("Account created successfully. Going to login page now.", () => {
        navigate("/login");
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setServerError(msg);
      setVoiceStatus("");
      tts(`Registration failed. ${msg}. Please try again.`, () => startVoiceFlow());
    } finally {
      setLoading(false);
    }
  }

  // ── Manual form submit ────────────────────────────────────────────────────
  function validate(): boolean {
    let valid = true;
    setUsernameError(""); setEmailError(""); setPasswordError("");
    if (!username.trim() || username.trim().length < 3) {
      setUsernameError("Username must be at least 3 characters."); valid = false;
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address."); valid = false;
    }
    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters."); valid = false;
    }
    return valid;
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(""); setSuccessMsg("");
    if (!validate()) return;
    submitAccount(username, email, password);
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            Voice will guide you — just speak when prompted.
          </p>

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
          {successMsg && (
            <p className="auth-success-banner" role="status" aria-live="polite">
              {successMsg}
            </p>
          )}

          <form className="auth-form" onSubmit={handleManualSubmit} noValidate aria-label="Registration form">

            {/* Username */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">Username</label>
              <div className="voice-field-row">
                <input
                  id="reg-username" type="text" className="form-input"
                  value={username} onChange={e => setUsername(e.target.value)}
                  autoComplete="username" aria-required="true"
                  aria-invalid={usernameError ? "true" : "false"}
                  disabled={loading}
                  placeholder="Auto-filled by voice or type here"
                />
                <button type="button" className="voice-field-btn" disabled={loading}
                  aria-label="Re-speak username"
                  onClick={() => voiceStep(
                    "Please say your username.",
                    "text",
                    v => setUsername(v)
                  )}>🎤</button>
              </div>
              {usernameError && <span className="field-error" role="alert">{usernameError}</span>}
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email address</label>
              <div className="voice-field-row">
                <input
                  id="reg-email" type="email" className="form-input"
                  value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" aria-required="true"
                  aria-invalid={emailError ? "true" : "false"}
                  disabled={loading}
                  placeholder="Auto-filled by voice or type here"
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
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password" aria-required="true"
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
              <span className="field-hint">Min 8 digits. Voice fills automatically.</span>
              {passwordError && <span className="field-error" role="alert">{passwordError}</span>}
            </div>

            <button type="submit" className="auth-submit-btn"
              disabled={loading} aria-busy={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="auth-alt-link">
            Already have an account? <Link to="/login">Sign in</Link>
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

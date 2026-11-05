/**
 * WelcomePage.tsx — Landing page with voice assistant greeting.
 *
 * Voice flow (runs automatically when TTS+STT are available):
 *   1. Greet the user and ask "Are you a new user or an existing user?"
 *   2. If "new"       → navigate to /register
 *      If "existing"  → navigate to /login
 *      If "demo"      → trigger Demo Login (no credentials needed)
 *   3. Keyboard buttons always visible as fallback / accessibility.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./WelcomePage.css";

// ─── browser capability helpers ──────────────────────────────────────────────

function hasTTS() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function getSTTCtor(): (new () => any) | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── TTS helper ───────────────────────────────────────────────────────────────

function speakThen(text: string, onEnd: () => void): () => void {
  if (!hasTTS() || !text.trim()) {
    const t = setTimeout(onEnd, 0);
    return () => clearTimeout(t);
  }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.88;
  utt.pitch = 1.0;
  utt.volume = 1.0;

  let called = false;
  const finish = () => {
    if (called) return;
    called = true;
    clearTimeout(guard);
    onEnd();
  };
  utt.onend = finish;
  utt.onerror = finish;

  const wordCount = text.trim().split(/\s+/).length;
  const guard = setTimeout(finish, wordCount * 145 + 2000);
  window.speechSynthesis.speak(utt);

  return () => {
    called = true;
    clearTimeout(guard);
    window.speechSynthesis.cancel();
  };
}

// ─── STT helper ───────────────────────────────────────────────────────────────

function listenOnce(
  onResult: (t: string) => void,
  onError: (msg: string) => void
): () => void {
  const Ctor = getSTTCtor();
  if (!Ctor) { onError("Speech recognition not supported."); return () => {}; }

  const rec = new Ctor(); // eslint-disable-line @typescript-eslint/no-explicit-any
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = false;

  let done = false;

  rec.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (done) return;
    done = true;
    onResult(event.results[0][0].transcript.trim());
  };

  rec.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (done) return;
    done = true;
    onError(event.error === "no-speech" ? "No speech detected." : "Speech recognition failed.");
  };

  rec.onend = () => {
    if (!done) { done = true; onError("No speech detected."); }
  };

  try { rec.start(); } catch { onError("Could not start microphone."); }

  return () => { done = true; try { rec.abort(); } catch { /* ignore */ } };
}

// ─── intent classifier ────────────────────────────────────────────────────────

function classifyIntent(t: string): "new" | "existing" | "demo" | "unknown" {
  const s = t.toLowerCase();
  if (/\b(new|register|sign ?up|create)\b/.test(s)) return "new";
  if (/\b(exist|login|log ?in|sign ?in|returning|already|back)\b/.test(s)) return "existing";
  if (/\b(demo|try|guest|sample|test)\b/.test(s)) return "demo";
  return "unknown";
}

// ─── step machine ─────────────────────────────────────────────────────────────

type Step = "idle" | "greet" | "listen" | "demo_logging_in" | "done" | "voice_off";

// ─── component ────────────────────────────────────────────────────────────────

export default function WelcomePage() {
  const navigate = useNavigate();
  const { demoLogin } = useAuth();

  const voiceAvailable = hasTTS() && !!getSTTCtor();

  const [step, setStep] = useState<Step>(voiceAvailable ? "idle" : "voice_off");
  const [statusMsg, setStatusMsg] = useState(voiceAvailable ? "Preparing voice assistant…" : "");
  const [demoError, setDemoError] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);

  const activeRef = useRef(true);
  const cancelTTSRef = useRef<(() => void) | null>(null);
  const cancelSTTRef = useRef<(() => void) | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      cancelTTSRef.current?.();
      cancelSTTRef.current?.();
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = useCallback(<T extends any[]>(fn: (...args: T) => void) => (...args: T) => { if (activeRef.current) fn(...args); }, []);

  function speak(text: string, then: () => void) {
    cancelSTTRef.current?.();
    cancelSTTRef.current = null;
    cancelTTSRef.current = speakThen(text, guard(then));
  }

  function listen(onResult: (t: string) => void, onFail: (msg: string) => void) {
    cancelTTSRef.current?.();
    cancelTTSRef.current = null;
    cancelSTTRef.current = listenOnce(guard(onResult), guard(onFail));
  }

  function go(s: Step) {
    if (!activeRef.current) return;
    setStep(s);
  }

  // ── main state machine ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRef.current) return;

    switch (step) {

      case "idle":
        setStatusMsg("Starting voice assistant…");
        // short pause so the browser TTS engine is ready
        setTimeout(() => { if (activeRef.current) go("greet"); }, 600);
        break;

      case "greet":
        setStatusMsg("🎤 Listening…");
        speak(
          "Welcome to VISION Learning. " +
          "Are you a new user, an existing user, or would you like to try the demo?",
          () => {
            retryRef.current = 0;
            go("listen");
          }
        );
        break;

      case "listen":
        setStatusMsg("🎤 Say: new user, existing user, or demo…");
        listen(
          (t) => {
            const intent = classifyIntent(t);
            if (intent === "new") {
              speak("Great! Let us create your account.", () => { if (activeRef.current) navigate("/register"); });
            } else if (intent === "existing") {
              speak("Welcome back! Let us sign you in.", () => { if (activeRef.current) navigate("/login"); });
            } else if (intent === "demo") {
              speak("Starting the demo. Please wait a moment.", () => { if (activeRef.current) go("demo_logging_in"); });
            } else {
              retryRef.current += 1;
              if (retryRef.current >= 3) {
                speak(
                  "I could not understand. You can use the buttons below.",
                  () => { if (activeRef.current) go("voice_off"); }
                );
              } else {
                speak(
                  `I did not catch that. Please say: new user, existing user, or demo.`,
                  () => { if (activeRef.current) go("listen"); }
                );
              }
            }
          },
          (msg) => {
            retryRef.current += 1;
            if (retryRef.current >= 3) {
              speak("Switching to button mode.", () => { if (activeRef.current) go("voice_off"); });
            } else {
              speak(`${msg} Please try again.`, () => { if (activeRef.current) go("listen"); });
            }
          }
        );
        break;

      case "demo_logging_in":
        setStatusMsg("Connecting demo account…");
        setDemoBusy(true);
        (async () => {
          try {
            await demoLogin();
            if (activeRef.current) {
              speak("Demo login successful. Taking you to the dashboard now.", () => {
                if (activeRef.current) navigate("/dashboard");
              });
            }
          } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!activeRef.current) return;
            const msg = err?.message ?? "Demo login failed.";
            setDemoError(msg);
            setDemoBusy(false);
            speak(`Sorry, ${msg}`, () => { if (activeRef.current) go("voice_off"); });
          }
        })();
        break;

      case "voice_off":
        setStatusMsg("");
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── keyboard demo login ───────────────────────────────────────────────────
  async function handleDemoLogin() {
    setDemoError("");
    setDemoBusy(true);
    cancelTTSRef.current?.();
    cancelSTTRef.current?.();
    try {
      await demoLogin();
      navigate("/dashboard");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setDemoError(err?.message ?? "Demo login failed. Please ensure the backend is running.");
      setDemoBusy(false);
    }
  }

  function stopVoice() {
    activeRef.current = false;
    cancelTTSRef.current?.();
    cancelSTTRef.current?.();
    activeRef.current = true;
    go("voice_off");
  }

  function restartVoice() {
    retryRef.current = 0;
    setDemoError("");
    activeRef.current = true;
    go("idle");
  }

  const voiceActive = voiceAvailable && step !== "voice_off";

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <header className="site-header" role="banner">
        <nav aria-label="Site navigation" className="site-nav">
          <span className="site-logo" aria-hidden="true">🎓</span>
          <span className="site-name">VISION Learning</span>
        </nav>
      </header>

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

          {/* ── voice status banner ──────────────────────────────────────── */}
          {voiceActive && statusMsg && (
            <div
              className="voice-status-banner"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              style={{
                background: "#e8f0fe", border: "1px solid #4285f4",
                borderRadius: "8px", padding: "0.75rem 1rem",
                marginBottom: "1.25rem", display: "flex",
                alignItems: "center", gap: "0.5rem",
              }}
            >
              <span aria-hidden="true">🎙️</span>
              <span style={{ flex: 1 }}>{statusMsg}</span>
              <button
                type="button"
                onClick={stopVoice}
                style={{
                  background: "transparent", border: "1px solid #4285f4",
                  borderRadius: "4px", padding: "0.2rem 0.6rem",
                  cursor: "pointer", fontSize: "0.8rem", color: "#4285f4",
                }}
                aria-label="Stop voice assistant and use buttons"
              >
                Use Buttons
              </button>
            </div>
          )}

          {/* ── restart voice button ─────────────────────────────────────── */}
          {voiceAvailable && step === "voice_off" && !demoBusy && (
            <button
              type="button"
              onClick={restartVoice}
              style={{
                marginBottom: "1rem", background: "transparent",
                border: "2px solid var(--colour-primary)",
                color: "var(--colour-primary)", borderRadius: "5px",
                padding: "0.5rem 1.2rem", cursor: "pointer",
                fontWeight: 600, fontSize: "0.95rem",
              }}
              aria-label="Restart voice assistant"
            >
              🎤 Restart Voice Assistant
            </button>
          )}

          {/* ── demo error ───────────────────────────────────────────────── */}
          {demoError && (
            <p role="alert" style={{ color: "#b91c1c", background: "#fef2f2",
              border: "1px solid #fca5a5", borderRadius: "6px",
              padding: "0.6rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
              {demoError}
            </p>
          )}

          {/* ── action buttons ───────────────────────────────────────────── */}
          <ul className="feature-list" aria-label="Platform features">
            <li>Academic curriculum learning at your own pace</li>
            <li>Competitive examination preparation</li>
            <li>Focused single-topic deep dives</li>
            <li>Full keyboard and screen-reader support</li>
            <li>Multilingual content delivery</li>
          </ul>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button
              className="btn-start"
              onClick={() => navigate("/login")}
              type="button"
              disabled={demoBusy}
            >
              Existing User — Sign In
            </button>

            <button
              className="btn-start"
              onClick={() => navigate("/register")}
              type="button"
              disabled={demoBusy}
              style={{ background: "var(--colour-secondary, #7c5cd8)" }}
            >
              New User — Register
            </button>

            <button
              className="btn-start"
              onClick={handleDemoLogin}
              type="button"
              disabled={demoBusy}
              aria-busy={demoBusy}
              style={{ background: "#16a34a" }}
            >
              {demoBusy ? "Starting Demo…" : "🎮 Try Demo"}
            </button>
          </div>

          <p id="start-hint" className="btn-hint" style={{ marginTop: "0.5rem" }}>
            {voiceAvailable
              ? "Voice assistant active — speak your choice, or use the buttons above."
              : "Use the buttons above to get started."}
          </p>
        </section>
      </main>

      <footer className="site-footer" role="contentinfo">
        <p>VISION Adaptive Learning Platform</p>
      </footer>
    </>
  );
}

/**
 * LearnerDashboard.tsx — Protected dashboard page with voice assistant.
 *
 * Voice flow (runs after session is confirmed):
 *   1. Welcomes the user by name.
 *   2. Asks which learning mode: Academic, Competitive, or Specific Topic.
 *   3. User speaks the mode → confirms verbally → saved via /profile.
 *   4. Asks if user wants to start an assignment → navigates to /diagnostic.
 *
 * Keyboard UI is always visible as a fallback.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import "./PlaceholderPage.css";

// ─── mode definitions ─────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  academic: "Academic Learning",
  competitive: "Competitive Exam Preparation",
  topic: "Specific-Topic Learning",
};

type ModeValue = "academic" | "competitive" | "topic";

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

// ─── classifiers ─────────────────────────────────────────────────────────────

function classifyMode(t: string): ModeValue | null {
  const s = t.toLowerCase();
  if (/\b(academic|school|curriculum|study|college)\b/.test(s)) return "academic";
  if (/\b(competitive|exam|entrance|competition|prep)\b/.test(s)) return "competitive";
  if (/\b(topic|specific|single|subject|focus)\b/.test(s)) return "topic";
  return null;
}

function isYes(t: string): boolean {
  return /\b(yes|yeah|yep|correct|right|ok|okay|sure|confirm|start|go)\b/.test(t.toLowerCase());
}

// ─── voice step machine ───────────────────────────────────────────────────────

type VoiceStep =
  | "voice_off"
  | "welcome"
  | "ask_mode"
  | "listen_mode"
  | "confirm_mode"
  | "confirm_mode_yn"
  | "saving_mode"
  | "ask_assignment"
  | "listen_assignment_yn"
  | "done";

// ─── component ────────────────────────────────────────────────────────────────

function LearnerDashboard() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const { profile, fetchProfile, saveMode } = useProfile();

  const voiceAvailable = hasTTS() && !!getSTTCtor();

  const [voiceStep, setVoiceStep] = useState<VoiceStep>("voice_off");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [pendingMode, setPendingMode] = useState<ModeValue | null>(null);

  const activeRef = useRef(true);
  const cancelTTSRef = useRef<(() => void) | null>(null);
  const cancelSTTRef = useRef<(() => void) | null>(null);
  const retryRef = useRef(0);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      activeRef.current = false;
      cancelTTSRef.current?.();
      cancelSTTRef.current?.();
    };
  }, []);

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

  // Start voice welcome once profile is loaded
  useEffect(() => {
    if (!loading && user !== null && profile !== undefined && voiceAvailable) {
      setVoiceStep("welcome");
    }
  }, [loading, user, profile, voiceAvailable]);

  // ── voice helpers ─────────────────────────────────────────────────────────
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

  function go(s: VoiceStep) {
    if (!activeRef.current) return;
    retryRef.current = 0;
    setVoiceStep(s);
  }

  function goRetry(s: VoiceStep, msg: string) {
    retryRef.current += 1;
    if (retryRef.current >= 3) {
      speak("Switching to button mode.", () => { if (activeRef.current) go("voice_off"); });
      return;
    }
    speak(msg, () => { if (activeRef.current) setVoiceStep(s); });
  }

  // ── main voice state machine ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeRef.current || voiceStep === "voice_off") return;
    if (!user) return;

    const name = user.username;

    switch (voiceStep) {

      case "welcome": {
        const modeText = profile?.learning_mode
          ? ` Your current learning mode is ${MODE_LABELS[profile.learning_mode]}.`
          : "";
        setVoiceStatus("🎤 Voice assistant active");
        speak(
          `Welcome, ${name}!${modeText} ` +
          "Which learning mode would you like? " +
          "You can say: Academic Learning, Competitive Exam Preparation, or Specific Topic Learning.",
          () => go("listen_mode")
        );
        break;
      }

      case "ask_mode":
        setVoiceStatus("🎤 Listening for learning mode…");
        speak(
          "Please say your preferred learning mode: " +
          "Academic Learning, Competitive Exam Preparation, or Specific Topic Learning.",
          () => { if (activeRef.current) setVoiceStep("listen_mode"); }
        );
        break;

      case "listen_mode":
        setVoiceStatus("🎤 Say your learning mode…");
        listen(
          (t) => {
            const mode = classifyMode(t);
            if (!mode) {
              goRetry("ask_mode", "I did not catch that. Please say Academic, Competitive, or Topic.");
              return;
            }
            retryRef.current = 0;
            setPendingMode(mode);
            setVoiceStep("confirm_mode");
          },
          (msg) => goRetry("ask_mode", `${msg} Please try again.`)
        );
        break;

      case "confirm_mode":
        if (!pendingMode) { go("ask_mode"); break; }
        setVoiceStatus(`Confirm: ${MODE_LABELS[pendingMode]}`);
        speak(
          `You selected ${MODE_LABELS[pendingMode]}. Is that correct? Say yes or no.`,
          () => { if (activeRef.current) setVoiceStep("confirm_mode_yn"); }
        );
        break;

      case "confirm_mode_yn":
        setVoiceStatus("🎤 Say yes or no…");
        listen(
          (t) => {
            if (isYes(t)) {
              go("saving_mode");
            } else {
              speak("Okay, let us pick again.", () => { if (activeRef.current) go("ask_mode"); });
            }
          },
          () => { if (activeRef.current) setVoiceStep("confirm_mode"); }
        );
        break;

      case "saving_mode":
        if (!pendingMode) { go("ask_mode"); break; }
        setVoiceStatus("Saving your learning mode…");
        (async () => {
          try {
            await saveMode(pendingMode);
            if (!activeRef.current) return;
            speak(
              `Great! ${MODE_LABELS[pendingMode]} has been set as your learning mode. ` +
              "Would you like to start an assignment now? Say yes or no.",
              () => { if (activeRef.current) setVoiceStep("listen_assignment_yn"); }
            );
          } catch {
            if (!activeRef.current) return;
            speak("Sorry, I could not save the mode. Please try again.", () => { if (activeRef.current) go("ask_mode"); });
          }
        })();
        break;

      case "ask_assignment":
        setVoiceStatus("🎤 Start assignment?");
        speak(
          "Would you like to start an assignment now? Say yes or no.",
          () => { if (activeRef.current) setVoiceStep("listen_assignment_yn"); }
        );
        break;

      case "listen_assignment_yn":
        setVoiceStatus("🎤 Say yes to start assignment, or no to stay here…");
        listen(
          (t) => {
            if (isYes(t)) {
              speak("Starting your assessment now.", () => { if (activeRef.current) navigate("/diagnostic"); });
            } else {
              speak("Okay. You can start anytime using the button on screen.", () => { if (activeRef.current) go("voice_off"); });
            }
          },
          () => { if (activeRef.current) setVoiceStep("ask_assignment"); }
        );
        break;

      case "done":
        go("voice_off");
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceStep, user]);

  async function handleLogout() {
    cancelTTSRef.current?.();
    cancelSTTRef.current?.();
    await logout();
    navigate("/", { replace: true });
  }

  function stopVoice() {
    activeRef.current = false;
    cancelTTSRef.current?.();
    cancelSTTRef.current?.();
    activeRef.current = true;
    setVoiceStep("voice_off");
  }

  function restartVoice() {
    retryRef.current = 0;
    activeRef.current = true;
    go("welcome");
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

  if (!user) return null;

  const voiceActive = voiceStep !== "voice_off";

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

          {/* ── voice status banner ─────────────────────────────────────── */}
          {voiceActive && voiceStatus && (
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              style={{
                background: "#e8f0fe", border: "1px solid #4285f4",
                borderRadius: "8px", padding: "0.65rem 1rem",
                margin: "0.75rem 0", display: "flex",
                alignItems: "center", gap: "0.5rem", fontSize: "0.92rem",
              }}
            >
              <span aria-hidden="true">🎙️</span>
              <span style={{ flex: 1 }}>{voiceStatus}</span>
              <button
                type="button"
                onClick={stopVoice}
                style={{
                  background: "transparent", border: "1px solid #4285f4",
                  borderRadius: "4px", padding: "0.2rem 0.6rem",
                  cursor: "pointer", fontSize: "0.78rem", color: "#4285f4",
                }}
                aria-label="Stop voice assistant"
              >
                Stop Voice
              </button>
            </div>
          )}

          {/* ── restart voice ───────────────────────────────────────────── */}
          {voiceAvailable && !voiceActive && (
            <button
              type="button"
              onClick={restartVoice}
              style={{
                margin: "0.5rem 0 0.75rem",
                background: "transparent",
                border: "2px solid var(--colour-primary)",
                color: "var(--colour-primary)",
                borderRadius: "5px",
                padding: "0.4rem 1rem",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              🎤 Restart Voice Assistant
            </button>
          )}

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
        <p>VISION Adaptive Learning Platform</p>
      </footer>
    </div>
  );
}

export default LearnerDashboard;

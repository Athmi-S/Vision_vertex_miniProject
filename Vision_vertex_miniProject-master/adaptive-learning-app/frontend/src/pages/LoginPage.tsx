/**
 * LoginPage.tsx — Step-by-step voice-guided sign in.
 *
 * Sequence:
 *   1. System speaks: "Please say your username or email address."
 *   2. Microphone activates only after the prompt finishes.
 *   3. Repeats recognized username or email and asks for yes/no confirmation:
 *      "I heard: [identifier]. Is this correct? Say yes or no."
 *   4. On "no" -> asks to provide it again: "Okay, let us try again. Please say your username or email address."
 *   5. On confirmation -> securely requests password through the password input.
 *      Password is NEVER spoken aloud, repeated, or logged.
 *   6. Submits credentials through the existing login API.
 *   7. Waits for authentication to succeed and session to be established.
 *   8. Automatically navigates to dashboard only after successful authentication.
 *   9. If authentication fails -> announces suitable error and allows retry.
 */

import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useVoiceCoordinator } from "../hooks/useVoiceCoordinator";
import {
  parseYesNo,
  parseUsername,
  parseEmail,
  parseSpokenPassword,
  makeEmailSpeakable,
  makeUsernameSpeakable,
} from "../utils/speechUtils";
import "./AuthForm.css";

type Step =
  | "idle"
  | "identifier_prompt" | "identifier_listen" | "identifier_confirm" | "identifier_yn"
  | "password_prompt"   | "password_listen"
  | "logging_in"        | "done"
  | "keyboard_only";

const MAX_RETRIES = 3;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const {
    ttsSupported,
    sttSupported,
    voiceAvailable,
    speak,
    listen,
    cancel,
    activeRef,
  } = useVoiceCoordinator();

  // Form state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");

  // Voice state
  const [step, setStep] = useState<Step>(voiceAvailable ? "idle" : "keyboard_only");
  const [statusMsg, setStatusMsg] = useState(
    voiceAvailable ? "Preparing voice sign in…" : ""
  );

  // Stable refs
  const retryCountRef = useRef(0);
  const pendingIdentifier = useRef("");
  const pendingPassword = useRef("");
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);

  // Central voice error handler
  function handleVoiceError(
    errorMsg: string,
    isPermissionDenied: boolean,
    retryStep: Step,
    retryPromptText: string
  ) {
    if (!activeRef.current) return;

    if (isPermissionDenied) {
      speak(
        "Microphone access was denied. Please use the sign in form below.",
        () => {
          if (activeRef.current) {
            setStep("keyboard_only");
            setStatusMsg("Microphone access denied. You can use the form below.");
          }
        }
      );
      return;
    }

    retryCountRef.current += 1;
    if (retryCountRef.current >= MAX_RETRIES) {
      speak(
        `${errorMsg} Switching to keyboard mode. Please type your credentials in the form below.`,
        () => {
          if (activeRef.current) {
            setStep("keyboard_only");
            setStatusMsg("");
          }
        }
      );
      return;
    }

    speak(`${errorMsg} ${retryPromptText}`, () => {
      if (activeRef.current) {
        setStep(retryStep);
      }
    });
  }

  // Format identifier for clear speech readback
  function formatIdentifierForSpeech(val: string): string {
    if (val.includes("@")) {
      return makeEmailSpeakable(val);
    }
    return makeUsernameSpeakable(val);
  }

  // Voice state machine
  useEffect(() => {
    if (!activeRef.current) return;

    switch (step) {
      case "idle":
        setStatusMsg("🔊 Preparing…");
        speak("Please say your username or email address.", () => {
          if (activeRef.current) setStep("identifier_listen");
        });
        break;

      case "identifier_prompt":
        setStatusMsg("🔊 Please say your username or email address…");
        speak("Please say your username or email address.", () => {
          if (activeRef.current) setStep("identifier_listen");
        });
        break;

      case "identifier_listen":
        setStatusMsg("🎤 Listening for username or email…");
        listen(
          (t) => {
            const raw = t.trim();
            let parsed = "";
            if (raw.toLowerCase().includes("at") || raw.includes("@")) {
              parsed = parseEmail(raw);
            } else {
              parsed = parseUsername(raw);
            }

            if (!parsed || parsed.length < 3) {
              handleVoiceError(
                "I could not recognise a valid username or email address.",
                false,
                "identifier_listen",
                "Please say your username or email address."
              );
              return;
            }

            retryCountRef.current = 0;
            pendingIdentifier.current = parsed;
            setStep("identifier_confirm");
          },
          (msg, isDenied) => {
            handleVoiceError(
              msg,
              !!isDenied,
              "identifier_listen",
              "Please say your username or email address."
            );
          }
        );
        break;

      case "identifier_confirm":
        setStatusMsg(`Confirm: ${pendingIdentifier.current}`);
        speak(
          `I heard: ${formatIdentifierForSpeech(pendingIdentifier.current)}. Is this correct? Say yes or no.`,
          () => {
            if (activeRef.current) setStep("identifier_yn");
          }
        );
        break;

      case "identifier_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            const ans = parseYesNo(t);
            if (ans === "yes") {
              retryCountRef.current = 0;
              setIdentifier(pendingIdentifier.current);
              setStep("password_prompt");
            } else if (ans === "no") {
              retryCountRef.current = 0;
              speak("Okay, let us try again. Please say your username or email address.", () => {
                if (activeRef.current) setStep("identifier_listen");
              });
            } else {
              handleVoiceError(
                "I did not catch that.",
                false,
                "identifier_yn",
                "Is this correct? Say yes or no."
              );
            }
          },
          (msg, isDenied) => {
            handleVoiceError(
              msg,
              !!isDenied,
              "identifier_yn",
              "Is this correct? Say yes or no."
            );
          }
        );
        break;

      case "password_prompt":
        setStatusMsg("🔑 Please enter or say your password…");
        passwordInputRef.current?.focus();
        speak(
          "Please enter your password in the password field, or say your password digits. Your password will never be spoken aloud.",
          () => {
            if (activeRef.current) setStep("password_listen");
          }
        );
        break;

      case "password_listen":
        setStatusMsg("🎤 Listening for password digits… (or type in the password input)");
        passwordInputRef.current?.focus();
        listen(
          (t) => {
            const pwd = parseSpokenPassword(t);
            if (!pwd) {
              handleVoiceError(
                "I did not catch any digits or password.",
                false,
                "password_listen",
                "Please enter your password in the password field, or say your password digits."
              );
              return;
            }
            retryCountRef.current = 0;
            pendingPassword.current = pwd;
            setPassword(pwd);
            speak("Password received. Signing in.", () => {
              if (activeRef.current) setStep("logging_in");
            });
          },
          (msg, isDenied) => {
            handleVoiceError(
              msg,
              !!isDenied,
              "password_listen",
              "Please enter your password in the password field, or say your password digits."
            );
          }
        );
        break;

      case "logging_in": {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setStatusMsg("Signing in…");

        const finalIdentifier = pendingIdentifier.current || identifier.trim();
        const finalPassword = pendingPassword.current || password;

        (async () => {
          try {
            await login(finalIdentifier, finalPassword);
            isSubmittingRef.current = false;
            if (activeRef.current) {
              setStep("done");
              setStatusMsg("Signed in! Going to dashboard…");
              speak("Sign in successful. Going to your dashboard now.", () => {
                if (activeRef.current) navigate("/dashboard");
              });
            }
          } catch {
            isSubmittingRef.current = false;
            if (!activeRef.current) return;
            const genericMsg = "The username, email, or password is incorrect.";
            setServerError(genericMsg);
            speak(`Sign in failed. ${genericMsg} Please try again.`, () => {
              if (activeRef.current) {
                setPassword("");
                pendingPassword.current = "";
                retryCountRef.current = 0;
                setStep("identifier_prompt");
              }
            });
          }
        })();
        break;
      }

      case "done":
        setStatusMsg("Signed in! Going to dashboard…");
        break;

      case "keyboard_only":
        setStatusMsg("");
        break;
    }
  }, [step, speak, listen, login, navigate, activeRef]);

  // Voice controls
  function cancelVoice() {
    cancel();
    setStep("keyboard_only");
    setStatusMsg("");
  }

  function restartVoice() {
    if (!voiceAvailable) return;
    cancel();
    retryCountRef.current = 0;
    setServerError("");
    setFormError("");
    setStep("identifier_prompt");
  }

  function triggerFieldVoice(targetStep: Step) {
    if (!voiceAvailable) return;
    cancel();
    retryCountRef.current = 0;
    setServerError("");
    setFormError("");
    setStep(targetStep);
  }

  // Manual Form Submission
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    cancel();
    setFormError("");
    setServerError("");

    const idVal = identifier.trim();
    const pwVal = password;

    if (!idVal || !pwVal) {
      setFormError("Please enter your username or email and password.");
      return;
    }

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setStep("logging_in");

    try {
      await login(idVal, pwVal);
      isSubmittingRef.current = false;
      navigate("/dashboard");
    } catch {
      isSubmittingRef.current = false;
      const genericMsg = "The username, email, or password is incorrect.";
      setServerError(genericMsg);
      setStep("keyboard_only");
    }
  }

  const busy = step === "logging_in" || step === "done";
  const voiceActive = voiceAvailable && step !== "keyboard_only";

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
          <p className="auth-subtitle">
            {voiceAvailable
              ? "Voice guides you — speak when prompted, or type in the form below."
              : "Enter your credentials to sign in."}
          </p>

          {/* Browser capability warning */}
          {!voiceAvailable && (
            <p className="voice-unavailable-notice" role="note">
              {!ttsSupported && !sttSupported
                ? "Voice features are not available in this browser. Please use Chrome or Edge for voice interaction."
                : !sttSupported
                ? "Speech input is not supported in this browser. Please use Chrome or Edge for voice interaction."
                : "Text-to-speech is not supported in this browser."}
            </p>
          )}

          {/* Voice status banner */}
          {voiceActive && statusMsg && (
            <div
              className="voice-status-banner"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="voice-status-icon" aria-hidden="true">🎙️</span>
              <span>{statusMsg}</span>
              <button
                type="button"
                className="voice-cancel-btn"
                onClick={cancelVoice}
                aria-label="Stop voice mode and use the keyboard form instead"
              >
                Use Keyboard
              </button>
            </div>
          )}

          {/* Restart voice button */}
          {voiceAvailable && step === "keyboard_only" && (
            <button
              type="button"
              className="voice-restart-btn"
              onClick={restartVoice}
              aria-label="Restart voice-guided sign in"
            >
              🎤 Start Voice Mode
            </button>
          )}

          {/* Error messages */}
          {serverError && (
            <p className="auth-error-banner" role="alert">{serverError}</p>
          )}
          {formError && (
            <p className="auth-error-banner" role="alert">{formError}</p>
          )}

          {/* Form */}
          <form className="auth-form" onSubmit={handleManualSubmit} noValidate>
            {/* Username or Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-identifier">
                Username or Email address
              </label>
              <div className="voice-field-row">
                <input
                  id="login-identifier"
                  type="text"
                  className="form-input"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    pendingIdentifier.current = e.target.value;
                  }}
                  autoComplete="username"
                  disabled={busy}
                  placeholder="Auto-filled by voice, or type here"
                  autoFocus
                />
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => triggerFieldVoice("identifier_prompt")}
                    disabled={busy}
                    aria-label="Start voice input for username or email"
                  >
                    🎤
                  </button>
                )}
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    ref={passwordInputRef}
                    id="login-password"
                    type={showPwd ? "text" : "password"}
                    className="form-input"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      pendingPassword.current = e.target.value;
                    }}
                    autoComplete="current-password"
                    disabled={busy}
                    placeholder="Auto-filled by voice, or type here"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? "🙈" : "👁"}
                  </button>
                </div>
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => triggerFieldVoice("password_prompt")}
                    disabled={busy}
                    aria-label="Start voice input for password"
                  >
                    🎤
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign In"}
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

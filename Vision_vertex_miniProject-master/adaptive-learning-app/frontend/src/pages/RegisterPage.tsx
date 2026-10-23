/**
 * RegisterPage.tsx — Step-by-step voice-guided registration.
 *
 * Sequence:
 *   1. System speaks: "Please say your username."
 *   2. Microphone activates only after the speech finishes.
 *   3. Repeats recognized username: "I heard your username as: [username]. Is this correct? Say yes or no."
 *   4. On "yes" -> moves to email field.
 *      On "no"  -> asks for username again.
 *   5. System speaks: "Please say your email address."
 *      Repeats recognized email and asks for confirmation. If incorrect, retry.
 *   6. Secure password entry: focus password input.
 *      Password is NEVER spoken aloud, repeated, or logged.
 *   7. Validates required fields using existing rules:
 *      - username: min 3 chars, letters/numbers/underscores only.
 *      - email: valid email address.
 *      - password: min 8 chars with at least one number.
 *   8. Submits registration form only after all required fields are valid.
 *   9. On success -> automatically navigates to /login.
 *  10. Keyboard/screen-reader manual input is available at all times.
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
  | "username_prompt" | "username_listen" | "username_confirm" | "username_yn"
  | "email_prompt"    | "email_listen"    | "email_confirm"    | "email_yn"
  | "password_prompt" | "password_listen"
  | "submitting"      | "done"
  | "keyboard_only";

const MAX_RETRIES = 3;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
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
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState("");
  const [serverError, setServerError] = useState("");

  // Voice state
  const [step, setStep] = useState<Step>(voiceAvailable ? "idle" : "keyboard_only");
  const [statusMsg, setStatusMsg] = useState(
    voiceAvailable ? "Preparing voice setup…" : ""
  );

  // Stable refs
  const retryCountRef = useRef(0);
  const pendingUsername = useRef("");
  const pendingEmail = useRef("");
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
        "Microphone access was denied. Please use the registration form below.",
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
        `${errorMsg} Switching to keyboard mode. Please fill in the registration form below.`,
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

  // Voice state machine
  useEffect(() => {
    if (!activeRef.current) return;

    switch (step) {
      case "idle":
        setStatusMsg("🔊 Preparing…");
        speak("Please say your username.", () => {
          if (activeRef.current) setStep("username_listen");
        });
        break;

      case "username_prompt":
        setStatusMsg("🔊 Please say your username…");
        speak("Please say your username.", () => {
          if (activeRef.current) setStep("username_listen");
        });
        break;

      case "username_listen":
        setStatusMsg("🎤 Listening for username…");
        listen(
          (t) => {
            const v = parseUsername(t);
            if (!v || v.length < 3) {
              handleVoiceError(
                "Username must be at least 3 characters with letters, numbers, or underscores.",
                false,
                "username_listen",
                "Please say your username."
              );
              return;
            }
            retryCountRef.current = 0;
            pendingUsername.current = v;
            setStep("username_confirm");
          },
          (msg, isDenied) => {
            handleVoiceError(msg, !!isDenied, "username_listen", "Please say your username.");
          }
        );
        break;

      case "username_confirm":
        setStatusMsg(`Confirm username: ${pendingUsername.current}`);
        speak(
          `I heard your username as: ${makeUsernameSpeakable(pendingUsername.current)}. Is this correct? Say yes or no.`,
          () => {
            if (activeRef.current) setStep("username_yn");
          }
        );
        break;

      case "username_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            const ans = parseYesNo(t);
            if (ans === "yes") {
              retryCountRef.current = 0;
              setUsername(pendingUsername.current);
              setStep("email_prompt");
            } else if (ans === "no") {
              retryCountRef.current = 0;
              speak("Okay, let us try again. Please say your username.", () => {
                if (activeRef.current) setStep("username_listen");
              });
            } else {
              handleVoiceError(
                "I did not catch that.",
                false,
                "username_yn",
                "Is your username correct? Say yes or no."
              );
            }
          },
          (msg, isDenied) => {
            handleVoiceError(msg, !!isDenied, "username_yn", "Is your username correct? Say yes or no.");
          }
        );
        break;

      case "email_prompt":
        setStatusMsg("🔊 Please say your email address…");
        speak("Please say your email address.", () => {
          if (activeRef.current) setStep("email_listen");
        });
        break;

      case "email_listen":
        setStatusMsg("🎤 Listening for email address…");
        listen(
          (t) => {
            const v = parseEmail(t);
            if (!v || !v.includes("@") || !v.includes(".")) {
              handleVoiceError(
                "I did not catch a valid email address.",
                false,
                "email_listen",
                "Please say your email address."
              );
              return;
            }
            retryCountRef.current = 0;
            pendingEmail.current = v;
            setStep("email_confirm");
          },
          (msg, isDenied) => {
            handleVoiceError(msg, !!isDenied, "email_listen", "Please say your email address.");
          }
        );
        break;

      case "email_confirm":
        setStatusMsg(`Confirm email: ${pendingEmail.current}`);
        speak(
          `I heard your email as: ${makeEmailSpeakable(pendingEmail.current)}. Is this correct? Say yes or no.`,
          () => {
            if (activeRef.current) setStep("email_yn");
          }
        );
        break;

      case "email_yn":
        setStatusMsg("🎤 Say yes or no…");
        listen(
          (t) => {
            const ans = parseYesNo(t);
            if (ans === "yes") {
              retryCountRef.current = 0;
              setEmail(pendingEmail.current);
              setStep("password_prompt");
            } else if (ans === "no") {
              retryCountRef.current = 0;
              speak("Okay, let us try the email again. Please say your email address.", () => {
                if (activeRef.current) setStep("email_listen");
              });
            } else {
              handleVoiceError(
                "I did not catch that.",
                false,
                "email_yn",
                "Is your email address correct? Say yes or no."
              );
            }
          },
          (msg, isDenied) => {
            handleVoiceError(msg, !!isDenied, "email_yn", "Is your email address correct? Say yes or no.");
          }
        );
        break;

      case "password_prompt":
        setStatusMsg("🔑 Please enter or say your password…");
        passwordInputRef.current?.focus();
        speak(
          "Please enter your password in the password field, or say your password digits. It must be at least 8 characters with at least one number. Your password will never be spoken aloud.",
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
            if (pwd.length < 8 || !/\d/.test(pwd)) {
              handleVoiceError(
                "Password must be at least 8 characters with at least one number.",
                false,
                "password_listen",
                "Please enter your password in the password field, or say your password digits."
              );
              return;
            }
            retryCountRef.current = 0;
            pendingPassword.current = pwd;
            setPassword(pwd);
            speak("Password received. Creating your account.", () => {
              if (activeRef.current) setStep("submitting");
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

      case "submitting": {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setStatusMsg("Creating your account…");

        const finalUsername = pendingUsername.current || username.trim();
        const finalEmail = pendingEmail.current || email.trim();
        const finalPassword = pendingPassword.current || password;

        (async () => {
          try {
            await register(finalUsername, finalEmail, finalPassword);
            isSubmittingRef.current = false;
            if (activeRef.current) {
              setStep("done");
              setStatusMsg("Account created! Navigating to sign in…");
              speak("Account created successfully. Navigating to the sign in page now.", () => {
                if (activeRef.current) navigate("/login");
              });
            }
          } catch (err: unknown) {
            isSubmittingRef.current = false;
            if (!activeRef.current) return;
            const msg = err instanceof Error ? err.message : "Registration failed.";
            setServerError(msg);
            const isEmailIssue = msg.toLowerCase().includes("email");
            speak(`Registration could not be completed. ${msg} Let us try again.`, () => {
              if (activeRef.current) {
                retryCountRef.current = 0;
                setStep(isEmailIssue ? "email_prompt" : "username_prompt");
              }
            });
          }
        })();
        break;
      }

      case "done":
        setStatusMsg("Account created! Navigating to sign in…");
        break;

      case "keyboard_only":
        setStatusMsg("");
        break;
    }
  }, [step, speak, listen, register, navigate, activeRef]);

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
    setStep("username_prompt");
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

    const u = username.trim();
    const em = email.trim();
    const pw = password;

    if (!u || !em || !pw) {
      setFormError("Please fill in all required fields.");
      return;
    }
    if (u.length < 3) {
      setFormError("Username must be at least 3 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(u)) {
      setFormError("Username may only contain letters, numbers, and underscores.");
      return;
    }
    if (!em.includes("@") || !em.includes(".")) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (pw.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (!/\d/.test(pw)) {
      setFormError("Password must contain at least one number.");
      return;
    }

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setStep("submitting");

    try {
      await register(u, em, pw);
      isSubmittingRef.current = false;
      navigate("/login");
    } catch (err: unknown) {
      isSubmittingRef.current = false;
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setServerError(msg);
      setStep("keyboard_only");
    }
  }

  const busy = step === "submitting" || step === "done";
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            {voiceAvailable
              ? "Voice guides you — speak when prompted, or type in the form below."
              : "Fill in the form below to create your account."}
          </p>

          {/* Browser capability warning */}
          {!voiceAvailable && (
            <p className="voice-unavailable-notice" role="note">
              {!ttsSupported && !sttSupported
                ? "Voice features are not available in this browser. Please use Chrome or Edge for voice interaction. You can still register using the form below."
                : !sttSupported
                ? "Speech input is not supported in this browser. Please use Chrome or Edge for voice interaction. You can still register using the form below."
                : "Text-to-speech is not supported in this browser. You can still register using the form below."}
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
              aria-label="Restart voice-guided registration"
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
            {/* Username */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">Username</label>
              <div className="voice-field-row">
                <input
                  id="reg-username"
                  type="text"
                  className="form-input"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    pendingUsername.current = e.target.value;
                  }}
                  disabled={busy}
                  autoComplete="username"
                  placeholder="Auto-filled by voice, or type here"
                  aria-describedby="reg-username-hint"
                />
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => triggerFieldVoice("username_prompt")}
                    disabled={busy}
                    aria-label="Start voice input for username"
                  >
                    🎤
                  </button>
                )}
              </div>
              <span id="reg-username-hint" className="field-hint">
                Letters, numbers, and underscores only. Minimum 3 characters.
              </span>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email address</label>
              <div className="voice-field-row">
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    pendingEmail.current = e.target.value;
                  }}
                  disabled={busy}
                  autoComplete="email"
                  placeholder="Auto-filled by voice, or type here"
                />
                {voiceAvailable && (
                  <button
                    type="button"
                    className="voice-field-btn"
                    onClick={() => triggerFieldVoice("email_prompt")}
                    disabled={busy}
                    aria-label="Start voice input for email"
                  >
                    🎤
                  </button>
                )}
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="voice-field-row">
                <div className="password-wrapper" style={{ flex: 1 }}>
                  <input
                    ref={passwordInputRef}
                    id="reg-password"
                    type={showPwd ? "text" : "password"}
                    className="form-input"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      pendingPassword.current = e.target.value;
                    }}
                    disabled={busy}
                    autoComplete="new-password"
                    placeholder="Auto-filled by voice, or type here"
                    aria-describedby="reg-password-hint"
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
              <span id="reg-password-hint" className="field-hint">
                Minimum 8 characters with at least one number. Spoken digits are accepted and never read aloud.
              </span>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy}
            >
              {busy ? "Creating account…" : "Create Account"}
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

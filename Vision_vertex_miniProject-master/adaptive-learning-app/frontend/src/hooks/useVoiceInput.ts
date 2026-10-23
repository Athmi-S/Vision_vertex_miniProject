/**
 * useVoiceInput.ts — Voice-driven field input hook for visually impaired users.
 *
 * Provides a complete voice input flow for text fields:
 *   1. TTS speaks a prompt: "Please say your email address."
 *   2. STT listens and captures what the user says.
 *   3. TTS reads back: "I heard: a t h m i at gmail dot com. Is this correct?
 *                       Say yes to confirm, or no to try again."
 *   4. STT listens for "yes" / "no".
 *   5. On "yes" → value is accepted and onConfirmed() is called.
 *      On "no"  → loop back to step 1.
 *
 * Also exposes helpers for PIN password entry:
 *   - speakPinPrompt()  → TTS says "Please say your 4-digit PIN, one digit at a time."
 *   - PIN digits spoken as "1 2 3 4" → captured as "1234"
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// SpeechRecognition setup (same pattern as useSTT.ts)
// ---------------------------------------------------------------------------
type SpeechRecognitionCtor = new () => any; // eslint-disable-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make an email address speakable.
 * "athmi@gmail.com" → "a t h m i at gmail dot com"
 */
function makeEmailSpeakable(email: string): string {
  return email
    .replace(/@/, " at ")
    .replace(/\./g, " dot ")
    .split("")
    .map((ch) => {
      if (/[a-zA-Z]/.test(ch)) return ch + " "; // space out letters
      return ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Make a username speakable — spell it out letter by letter.
 */
function makeUsernameSpeakable(name: string): string {
  return name.split("").join(" ");
}

/**
 * Normalise a spoken email string.
 * "athmi at gmail dot com" → "athmi@gmail.com"
 */
function normaliseSpokenEmail(spoken: string): string {
  return spoken
    .trim()
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s/g, ""); // remove remaining spaces
}

/**
 * Normalise a spoken PIN — "1 2 3 4" or "one two three four" → "1234"
 */
const SPOKEN_DIGIT: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
};

function normaliseSpokenPin(spoken: string): string {
  const words = spoken.trim().toLowerCase().split(/[\s,]+/);
  return words
    .map((w) => SPOKEN_DIGIT[w] ?? "")
    .filter(Boolean)
    .join("");
}

// ---------------------------------------------------------------------------
// TTS helper (standalone, does not need the useTTS hook)
// ---------------------------------------------------------------------------
function ttsSpeak(text: string, onEnd?: () => void): void {
  if (!("speechSynthesis" in window) || !text.trim()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.92;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  if (onEnd) {
    utt.onend = () => onEnd();
    utt.onerror = () => onEnd();
  }
  window.speechSynthesis.speak(utt);
}

// ---------------------------------------------------------------------------
// STT helper
// ---------------------------------------------------------------------------
function sttListen(onResult: (transcript: string) => void, onError: (msg: string) => void): () => void {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) {
    onError("Speech recognition not supported in this browser.");
    return () => {};
  }
  const rec = new Ctor(); // eslint-disable-line @typescript-eslint/no-explicit-any
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = false;

  rec.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const alts: string[] = [];
    for (let i = 0; i < event.results[0].length; i++) {
      alts.push(event.results[0][i].transcript.trim());
    }
    onResult(alts[0] ?? "");
  };
  rec.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    onError(event.error === "no-speech" ? "No speech detected." : "Speech recognition error.");
  };
  rec.start();
  return () => { try { rec.abort(); } catch (_) {} };
}

// ---------------------------------------------------------------------------
// Hook state types
// ---------------------------------------------------------------------------
export type VoiceInputPhase =
  | "idle"           // not started
  | "prompting"      // TTS speaking the prompt
  | "listening"      // mic open, waiting for speech
  | "confirming"     // TTS reading back + waiting for yes/no
  | "confirmed"      // value accepted
  | "error";         // unrecoverable error

export interface UseVoiceInputReturn {
  /** Is voice input supported in this browser? */
  supported: boolean;
  /** Current phase */
  phase: VoiceInputPhase;
  /** The captured + normalised value */
  value: string;
  /** Raw transcript (before normalisation) — shown in UI for transparency */
  rawTranscript: string;
  /** Any error message */
  error: string;
  /** Start the voice input flow with a custom prompt */
  start: (prompt: string, type?: "email" | "text" | "pin" | "username") => void;
  /** Cancel / reset */
  cancel: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useVoiceInput(): UseVoiceInputReturn {
  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition) &&
    "speechSynthesis" in window;

  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const [value, setValue] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [error, setError] = useState("");

  // Keep a ref so we can abort the current STT session from cleanup
  const stopSttRef = useRef<(() => void) | null>(null);
  // Keep the current input type so confirm/retry logic knows how to normalise
  const inputTypeRef = useRef<"email" | "text" | "pin" | "username">("text");
  // Keep the original prompt so we can replay it on retry
  const promptRef = useRef("");

  // Cleanup STT on unmount
  useEffect(() => {
    return () => {
      stopSttRef.current?.();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Internal: open mic and listen for the field value
  // -------------------------------------------------------------------------
  const listenForValue = useCallback(() => {
    setPhase("listening");
    stopSttRef.current = sttListen(
      (transcript) => {
        stopSttRef.current = null;

        // Normalise based on field type
        let normalised = transcript;
        if (inputTypeRef.current === "email") {
          normalised = normaliseSpokenEmail(transcript);
        } else if (inputTypeRef.current === "pin") {
          normalised = normaliseSpokenPin(transcript);
        } else if (inputTypeRef.current === "username") {
          normalised = transcript.trim().toLowerCase().replace(/\s+/g, "");
        } else {
          normalised = transcript.trim();
        }

        setRawTranscript(transcript);
        setValue(normalised);

        // Build readable confirmation
        let readable = normalised;
        if (inputTypeRef.current === "email") {
          readable = makeEmailSpeakable(normalised);
        } else if (inputTypeRef.current === "username") {
          readable = makeUsernameSpeakable(normalised);
        } else if (inputTypeRef.current === "pin") {
          readable = normalised.split("").join(" ");
        }

        const confirmPrompt =
          `I heard: ${readable}. ` +
          `Is this correct? Say yes to confirm, or no to try again.`;

        setPhase("confirming");
        ttsSpeak(confirmPrompt, () => {
          // Listen for yes / no
          stopSttRef.current = sttListen(
            (answer) => {
              stopSttRef.current = null;
              const a = answer.trim().toLowerCase();
              const isYes = /\b(yes|yeah|yep|correct|right|ok|okay|confirm|sure)\b/.test(a);
              const isNo  = /\b(no|nope|nah|wrong|incorrect|again|retry|redo)\b/.test(a);

              if (isYes) {
                setPhase("confirmed");
                ttsSpeak(`${inputTypeRef.current === "pin" ? "PIN" : "Value"} confirmed.`);
              } else if (isNo) {
                // Retry — go back to listening
                ttsSpeak(`Okay, let us try again. ${promptRef.current}`, () => {
                  listenForValue();
                });
              } else {
                // Didn't catch yes/no — ask again
                ttsSpeak(
                  `I did not catch that. Say yes to confirm ${readable}, or no to try again.`,
                  () => {
                    stopSttRef.current = sttListen(
                      (ans2) => {
                        stopSttRef.current = null;
                        const a2 = ans2.trim().toLowerCase();
                        if (/\b(yes|yeah|yep|correct|right|ok|okay|confirm|sure)\b/.test(a2)) {
                          setPhase("confirmed");
                        } else {
                          ttsSpeak(`Okay, let us try again. ${promptRef.current}`, () => listenForValue());
                        }
                      },
                      () => listenForValue(),
                    );
                  }
                );
              }
            },
            () => {
              // STT error on yes/no — retry the whole flow
              ttsSpeak(`I did not hear you. ${promptRef.current}`, () => listenForValue());
            }
          );
        });
      },
      (errMsg) => {
        stopSttRef.current = null;
        setError(errMsg);
        ttsSpeak(`${errMsg} Please try again. ${promptRef.current}`, () => listenForValue());
      }
    );
  }, []);

  // -------------------------------------------------------------------------
  // start — kick off the flow
  // -------------------------------------------------------------------------
  const start = useCallback((prompt: string, type: "email" | "text" | "pin" | "username" = "text") => {
    if (!supported) {
      setError("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    inputTypeRef.current = type;
    promptRef.current = prompt;
    setValue("");
    setRawTranscript("");
    setError("");
    setPhase("prompting");
    ttsSpeak(prompt, () => listenForValue());
  }, [supported, listenForValue]);

  // -------------------------------------------------------------------------
  // cancel — stop everything and reset
  // -------------------------------------------------------------------------
  const cancel = useCallback(() => {
    stopSttRef.current?.();
    stopSttRef.current = null;
    window.speechSynthesis?.cancel();
    setPhase("idle");
    setValue("");
    setRawTranscript("");
    setError("");
  }, []);

  return { supported, phase, value, rawTranscript, error, start, cancel };
}

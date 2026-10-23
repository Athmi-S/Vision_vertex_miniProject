/**
 * useTTS.ts — Text-to-Speech hook using the Web Speech API.
 *
 * Wraps window.speechSynthesis and SpeechSynthesisUtterance.
 * Exposes controlled speak/stop/repeat actions — does NOT auto-speak.
 *
 * Design decisions:
 *  - Never speaks automatically on render; every utterance requires an
 *    explicit user action (button press or keyboard shortcut).
 *  - Cancels any in-progress speech before starting a new utterance,
 *    preventing overlap.
 *  - Cleans up (cancels) on unmount so speech does not outlive the page.
 *  - Selects the best available voice for the requested BCP-47 language tag.
 *    Falls back to the browser default if no matching voice is found.
 *    Does NOT claim language support that the browser does not provide.
 *  - Returns `supported: false` on browsers without speechSynthesis so
 *    callers can hide/disable TTS controls gracefully.
 *
 * Language mapping:
 *  The learner's language_pref from the backend uses short codes:
 *    "en" → "en-US" (or best English voice available)
 *    "hi" → "hi-IN" (Hindi — only if the browser provides a Hindi voice)
 *    "kn" → "kn-IN" (Kannada — only if the browser provides a Kannada voice)
 *    "ta" → "ta-IN" (Tamil — only if the browser provides a Tamil voice)
 *  If no voice matches, the browser default is used and isFallbackVoice=true
 *  is set so the UI can inform the learner.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// BCP-47 tag mapping from backend language_pref codes
// ---------------------------------------------------------------------------
const LANG_TAG_MAP: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  kn: "kn-IN",
  ta: "ta-IN",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UseTTSReturn {
  /** True if the browser supports speechSynthesis. */
  supported: boolean;
  /** True while the TTS engine is speaking. */
  speaking: boolean;
  /**
   * True when no voice matching the learner's language was found and
   * the browser default voice is being used instead.
   */
  isFallbackVoice: boolean;
  /** The display name of the voice that will be used (empty if unsupported). */
  voiceName: string;
  /** Speak an arbitrary text string. Cancels any previous speech first. */
  speak: (text: string) => void;
  /**
   * Speak text and call onEnd when the utterance finishes.
   * Used to chain TTS → auto-start STT automatically.
   */
  speakThen: (text: string, onEnd: () => void) => void;
  /** Stop any current or queued speech immediately. */
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useTTS(languagePref: string = "en"): UseTTSReturn {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [speaking, setSpeaking] = useState(false);
  const [isFallbackVoice, setIsFallbackVoice] = useState(false);
  const [voiceName, setVoiceName] = useState("");

  // Keep a stable ref to the selected voice so it can be used inside
  // callbacks without causing stale closures.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // -------------------------------------------------------------------------
  // Voice selection — runs once after voices load (they load asynchronously)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!supported) return;

    function selectVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return; // not loaded yet

      const targetTag = LANG_TAG_MAP[languagePref] ?? "en-US";
      const targetLang = targetTag.split("-")[0].toLowerCase(); // e.g. "en"

      // 1. Exact match on full BCP-47 tag (e.g. "en-US")
      let match = voices.find(
        (v) => v.lang.toLowerCase() === targetTag.toLowerCase()
      );

      // 2. Partial match on language prefix (e.g. any "en-*" voice)
      if (!match) {
        match = voices.find((v) =>
          v.lang.toLowerCase().startsWith(targetLang)
        );
      }

      if (match) {
        voiceRef.current = match;
        setVoiceName(match.name);
        // Only a fallback if the language doesn't match what was requested
        const matchedLang = match.lang.toLowerCase().split("-")[0];
        setIsFallbackVoice(matchedLang !== targetLang);
      } else {
        // No match at all — use the browser default (first voice)
        const defaultVoice = voices[0] ?? null;
        voiceRef.current = defaultVoice;
        setVoiceName(defaultVoice?.name ?? "Browser default");
        setIsFallbackVoice(true);
      }
    }

    // Voices may already be available
    selectVoice();

    // Chrome loads voices asynchronously; listen for the event
    window.speechSynthesis.addEventListener("voiceschanged", selectVoice);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", selectVoice);
    };
  }, [supported, languagePref]);

  // -------------------------------------------------------------------------
  // Cancel speech on unmount (page navigation, component teardown)
  // -------------------------------------------------------------------------
  // Stable refs for utterance persistence (prevents Chrome GC bug) and timers
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const guardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Cancel speech and clear timers on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (guardTimeoutRef.current) clearTimeout(guardTimeoutRef.current);
      if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
      if (resumeIntervalRef.current) clearInterval(resumeIntervalRef.current);
      if (supported) {
        window.speechSynthesis.cancel();
      }
      activeUtteranceRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__visionActiveUtterance = null;
    };
  }, [supported]);

  // -------------------------------------------------------------------------
  // speak — cancel previous, create utterance, speak
  // -------------------------------------------------------------------------
  /** Internal helper: create and start an utterance, call onEnd when done. */
  const _speakWithCallback = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported || !text.trim()) {
        onEnd?.();
        return;
      }

      // Clear any pending timers
      if (guardTimeoutRef.current) clearTimeout(guardTimeoutRef.current);
      if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
      if (resumeIntervalRef.current) clearInterval(resumeIntervalRef.current);

      // Cancel any in-progress speech to prevent overlap
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      activeUtteranceRef.current = utterance;
      // Anchor utterance on window to prevent Chrome GC bug during speech
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__visionActiveUtterance = utterance;

      // Assign the selected voice (or leave unset to use browser default)
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
        utterance.lang = voiceRef.current.lang;
      }

      utterance.rate = 0.95;   // slightly slower than default — easier to follow
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      let called = false;
      const finish = () => {
        if (called) return;
        called = true;
        if (guardTimeoutRef.current) {
          clearTimeout(guardTimeoutRef.current);
          guardTimeoutRef.current = null;
        }
        if (resumeIntervalRef.current) {
          clearInterval(resumeIntervalRef.current);
          resumeIntervalRef.current = null;
        }
        setSpeaking(false);
        activeUtteranceRef.current = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__visionActiveUtterance = null;

        // Post-speech buffer: gives 250ms for speaker audio output to finish
        // cleanly before the microphone opens, preventing self-hearing loops.
        bufferTimeoutRef.current = setTimeout(() => {
          onEnd?.();
        }, 250);
      };

      utterance.onstart  = () => setSpeaking(true);
      utterance.onend    = finish;
      utterance.onerror  = (e) => {
        // If canceled or interrupted, clean up without firing onEnd
        if (e.error === "canceled" || e.error === "interrupted") {
          called = true;
          if (guardTimeoutRef.current) {
            clearTimeout(guardTimeoutRef.current);
            guardTimeoutRef.current = null;
          }
          if (resumeIntervalRef.current) {
            clearInterval(resumeIntervalRef.current);
            resumeIntervalRef.current = null;
          }
          setSpeaking(false);
          activeUtteranceRef.current = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__visionActiveUtterance = null;
          return;
        }
        finish();
      };
      utterance.onpause  = () => setSpeaking(false);
      utterance.onresume = () => setSpeaking(true);

      // Keep speech synthesis active on longer phrases (Chrome pause workaround)
      resumeIntervalRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 5000);

      // Generous safety guard: only triggers if browser completely fails to fire onend
      const wordCount = text.trim().split(/\s+/).length;
      const safetyMs = Math.max(wordCount * 600 + 4000, 6000);
      guardTimeoutRef.current = setTimeout(finish, safetyMs);

      // Slight delay after cancel to prevent Chrome from eating the utterance
      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      }, 40);
    },
    [supported]
  );

  const speak = useCallback(
    (text: string) => _speakWithCallback(text),
    [_speakWithCallback]
  );

  const speakThen = useCallback(
    (text: string, onEnd: () => void) => _speakWithCallback(text, onEnd),
    [_speakWithCallback]
  );

  // -------------------------------------------------------------------------
  // stop — cancel immediately
  // -------------------------------------------------------------------------
  const stop = useCallback(() => {
    if (!supported) return;
    if (guardTimeoutRef.current) clearTimeout(guardTimeoutRef.current);
    if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
    if (resumeIntervalRef.current) clearInterval(resumeIntervalRef.current);
    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__visionActiveUtterance = null;
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, isFallbackVoice, voiceName, speak, speakThen, stop };
}

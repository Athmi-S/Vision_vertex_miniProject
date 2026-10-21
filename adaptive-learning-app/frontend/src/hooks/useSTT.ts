/**
 * useSTT.ts — Speech-to-Text hook using the Web Speech Recognition API.
 *
 * Wraps webkitSpeechRecognition / SpeechRecognition.
 *
 * Works in: Chrome 25+, Edge 79+
 * Does NOT work in: Firefox, Safari (returns supported=false gracefully).
 *
 * Important limitation (documented honestly):
 *   In Chrome the audio is sent to Google's servers for processing.
 *   This is a browser platform constraint — not something this app controls.
 *   For a project demo this is acceptable. For production, a local STT
 *   engine (e.g. Whisper running on-device) would be needed.
 *
 * How option matching works:
 *   The learner says something like "option 2", "two", "the second one",
 *   "four", "option A", or the actual option text.
 *   matchOptionFromTranscript() scores each option against the transcript
 *   and returns the best match (or null if nothing is confident enough).
 *
 * Usage:
 *   const { supported, listening, transcript, startListening, stopListening } = useSTT();
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OptionForMatching {
  id: number;
  option_text: string;
}

export interface UseSTTReturn {
  /** True if SpeechRecognition is available in this browser. */
  supported: boolean;
  /** True while the microphone is open and listening. */
  listening: boolean;
  /** The latest recognised transcript (cleared on each new startListening call). */
  transcript: string;
  /** Any error message from the recognition API. Empty string when no error. */
  sttError: string;
  /** Open the microphone and start recognition. */
  startListening: () => void;
  /** Stop listening immediately. */
  stopListening: () => void;
}

// ---------------------------------------------------------------------------
// Number word → digit map for spoken answers like "two", "three" etc.
// Chrome STT may return "option 1" (digit) OR "option one" (word),
// so we include both forms.  We also include common mis-hearings.
// ---------------------------------------------------------------------------
const WORD_TO_NUMBER: Record<string, number> = {
  // digit strings (Chrome often returns these)
  "1": 1, "option 1": 1,
  "2": 2, "option 2": 2,
  "3": 3, "option 3": 3,
  "4": 4, "option 4": 4,
  "5": 5, "option 5": 5,
  "6": 6, "option 6": 6,

  // word forms
  one: 1, first: 1, "option one": 1,
  two: 2, second: 2, "option two": 2,
  three: 3, third: 3, "option three": 3,
  four: 4, fourth: 4, "option four": 4,
  five: 5, fifth: 5, "option five": 5,
  six: 6, sixth: 6, "option six": 6,

  // letter aliases (A/B/C/D style)
  a: 1, b: 2, c: 3, d: 4,
  "option a": 1, "option b": 2, "option c": 3, "option d": 4,
};

// ---------------------------------------------------------------------------
// matchOptionFromTranscript
// Given a spoken transcript and an array of options, return the option id
// that best matches, or null if no confident match is found.
//
// Strategy (in priority order):
//   1. Exact match on option text (case-insensitive)
//   2. Partial match — transcript contains the option text or vice versa
//   3. Number/ordinal match — "two" → option at index 1
// ---------------------------------------------------------------------------
export function matchOptionFromTranscript(
  transcript: string,
  options: OptionForMatching[]
): number | null {
  if (!transcript || options.length === 0) return null;

  // Normalise: lowercase, strip leading/trailing spaces, collapse multiple spaces
  const t = transcript.trim().toLowerCase().replace(/\s+/g, " ");

  // 1. Direct lookup in number map (handles "option 1", "one", "first", "a", etc.)
  //    Check the full transcript first, then progressively strip punctuation
  const stripped = t.replace(/[^a-z0-9 ]/g, "").trim();
  for (const key of [t, stripped]) {
    const mappedIndex = WORD_TO_NUMBER[key];
    if (mappedIndex !== undefined && mappedIndex >= 1 && mappedIndex <= options.length) {
      return options[mappedIndex - 1].id;
    }
  }

  // 2. Scan each word/bigram/trigram in the transcript against the map
  //    This catches "I choose option 1" or "my answer is two"
  const words = stripped.split(" ");
  for (let len = 3; len >= 1; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const phrase = words.slice(start, start + len).join(" ");
      const idx = WORD_TO_NUMBER[phrase];
      if (idx !== undefined && idx >= 1 && idx <= options.length) {
        return options[idx - 1].id;
      }
    }
  }

  // 3. Exact match on option text
  for (const opt of options) {
    if (stripped === opt.option_text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()) {
      return opt.id;
    }
  }

  // 4. Transcript contains the full option text (option text length > 2)
  for (const opt of options) {
    const optNorm = opt.option_text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (optNorm.length > 2 && stripped.includes(optNorm)) {
      return opt.id;
    }
  }

  // 5. Option text contains the transcript (useful for short numeric answers)
  for (const opt of options) {
    const optNorm = opt.option_text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (stripped.length > 1 && optNorm.includes(stripped)) {
      return opt.id;
    }
  }

  return null; // no confident match
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// Use `any` for SpeechRecognition because TypeScript's lib.dom.d.ts does not
// always include the full SpeechRecognition type. The webkit-prefixed version
// is the most widely available (Chrome, Edge).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

// Extend Window type to handle webkit prefix
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition?: SpeechRecognitionCtor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function useSTT(): UseSTTReturn {
  const SpeechRecognitionAPI: SpeechRecognitionCtor | undefined =
    typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined;

  const supported = !!SpeechRecognitionAPI;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sttError, setSttError] = useState("");

  // Keep a stable ref so we can stop recognition from outside the callback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // -------------------------------------------------------------------------
  // startListening
  // -------------------------------------------------------------------------
  const startListening = useCallback(() => {
    if (!supported || !SpeechRecognitionAPI) return;

    // Abort any existing session first
    recognitionRef.current?.abort();
    setSttError("");
    setTranscript("");

    const recognition: any = new SpeechRecognitionAPI();  // eslint-disable-line @typescript-eslint/no-explicit-any
    recognition.lang = "en-US";         // recognition language (English)
    recognition.interimResults = false; // only final results
    recognition.maxAlternatives = 5;    // more alternatives → better chance of matching
    recognition.continuous = false;     // stop after first final result

    recognition.onstart = () => setListening(true);
    recognition.onend   = () => setListening(false);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Collect all alternative transcripts and try each one for a number match.
      // Chrome often returns "option 1" as a lower-confidence alternative even
      // when the top result is a full sentence — so we check all alternatives.
      const alternatives: string[] = [];
      for (let i = 0; i < event.results[0].length; i++) {
        alternatives.push(event.results[0][i].transcript.trim());
      }

      // Pick the best alternative: prefer the one that matches a number phrase,
      // otherwise fall back to the highest-confidence (first) result.
      const matched = alternatives.find((alt) => {
        const norm = alt.toLowerCase().replace(/\s+/g, " ").trim();
        return WORD_TO_NUMBER[norm] !== undefined ||
          norm.match(/\b(option\s*[1-6abcdef]|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth)\b/i);
      });

      setTranscript((matched ?? alternatives[0] ?? "").trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      switch (event.error) {
        case "no-speech":
          setSttError("No speech detected. Please try again.");
          break;
        case "audio-capture":
          setSttError("Microphone not found. Please check your microphone.");
          break;
        case "not-allowed":
          setSttError(
            "Microphone access denied. Please allow microphone access in your browser settings."
          );
          break;
        case "network":
          setSttError("Network error during speech recognition. Please check your connection.");
          break;
        default:
          setSttError("Speech recognition failed. Please try again.");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [supported, SpeechRecognitionAPI]);

  // -------------------------------------------------------------------------
  // stopListening
  // -------------------------------------------------------------------------
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, transcript, sttError, startListening, stopListening };
}

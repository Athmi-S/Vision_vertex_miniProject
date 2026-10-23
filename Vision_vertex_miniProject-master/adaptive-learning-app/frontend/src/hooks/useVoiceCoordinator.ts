/**
 * useVoiceCoordinator.ts — Coordinated Text-to-Speech and Speech-to-Text controller.
 *
 * Guarantees:
 *  1. Mutual exclusion: Speech-to-Text never listens while Text-to-Speech is speaking.
 *  2. Clean transitions: Post-speech buffer ensures physical audio drains before mic opens.
 *  3. Session token safety: Incremental token ensures superseded utterances/recognitions
 *     cannot execute callbacks in subsequent steps.
 *  4. Chrome GC protection: Active utterance is anchored on window to prevent garbage collection.
 *  5. React StrictMode resilience: Active ref is reset on mount, preventing deadlocks.
 */

import { useRef, useCallback, useEffect } from "react";

export function useVoiceCoordinator() {
  const activeRef = useRef(true);
  const sessionTokenRef = useRef(0);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeRecognitionRef = useRef<any>(null);
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ttsSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const STTCtor: (new () => any) | null =
    typeof window !== "undefined"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null
      : null;

  const sttSupported = !!STTCtor;
  const voiceAvailable = ttsSupported && sttSupported;

  // Cancel everything and invalidate previous session tokens
  const cancel = useCallback(() => {
    sessionTokenRef.current += 1;

    if (guardTimerRef.current) {
      clearTimeout(guardTimerRef.current);
      guardTimerRef.current = null;
    }
    if (bufferTimerRef.current) {
      clearTimeout(bufferTimerRef.current);
      bufferTimerRef.current = null;
    }
    if (resumeIntervalRef.current) {
      clearInterval(resumeIntervalRef.current);
      resumeIntervalRef.current = null;
    }

    if (ttsSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    activeUtteranceRef.current = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__visionActiveUtterance = null;

    if (activeRecognitionRef.current) {
      try {
        activeRecognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      activeRecognitionRef.current = null;
    }
  }, [ttsSupported]);

  // Ensure activeRef is set to true on mount, and cancel on unmount
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      cancel();
    };
  }, [cancel]);

  /**
   * Speak a text string, then invoke onEnd after a post-speech safety buffer.
   * Cancels any prior speech or recognition first.
   */
  const speak = useCallback(
    (text: string, onEnd: () => void) => {
      cancel();
      const token = sessionTokenRef.current;

      if (!ttsSupported || !text.trim()) {
        const t = setTimeout(() => {
          if (activeRef.current && sessionTokenRef.current === token) {
            onEnd();
          }
        }, 0);
        return () => clearTimeout(t);
      }

      const utt = new SpeechSynthesisUtterance(text);
      activeUtteranceRef.current = utt;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__visionActiveUtterance = utt;
      utt.rate = 0.95;
      utt.pitch = 1.0;
      utt.volume = 1.0;

      let called = false;
      const finish = () => {
        if (called) return;
        called = true;
        if (guardTimerRef.current) {
          clearTimeout(guardTimerRef.current);
          guardTimerRef.current = null;
        }
        if (resumeIntervalRef.current) {
          clearInterval(resumeIntervalRef.current);
          resumeIntervalRef.current = null;
        }
        activeUtteranceRef.current = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__visionActiveUtterance = null;

        // Post-speech buffer: 250ms ensures physical speaker audio drains before mic opens
        bufferTimerRef.current = setTimeout(() => {
          if (activeRef.current && sessionTokenRef.current === token) {
            onEnd();
          }
        }, 250);
      };

      utt.onend = finish;
      utt.onerror = (e) => {
        // Canceled or interrupted means speech was superseded, do not invoke onEnd
        if (e.error === "canceled" || e.error === "interrupted") {
          called = true;
          if (guardTimerRef.current) {
            clearTimeout(guardTimerRef.current);
            guardTimerRef.current = null;
          }
          if (resumeIntervalRef.current) {
            clearInterval(resumeIntervalRef.current);
            resumeIntervalRef.current = null;
          }
          activeUtteranceRef.current = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__visionActiveUtterance = null;
          return;
        }
        finish();
      };

      resumeIntervalRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 5000);

      const wordCount = text.trim().split(/\s+/).length;
      const safetyMs = Math.max(wordCount * 600 + 4000, 6000);
      guardTimerRef.current = setTimeout(finish, safetyMs);

      // Slight delay after cancel to prevent Chrome from eating utterance
      setTimeout(() => {
        if (sessionTokenRef.current === token) {
          try {
            window.speechSynthesis.speak(utt);
          } catch {
            finish();
          }
        }
      }, 40);

      return cancel;
    },
    [cancel, ttsSupported]
  );

  /**
   * Listen once for user speech, then call onResult or onError.
   * Cancels any prior speech or recognition first.
   */
  const listen = useCallback(
    (
      onResult: (transcript: string) => void,
      onError: (msg: string, isPermissionDenied?: boolean) => void
    ) => {
      cancel();
      const token = sessionTokenRef.current;

      if (!sttSupported || !STTCtor) {
        onError(
          "Speech recognition is not supported in this browser. Please use Chrome or Edge.",
          false
        );
        return () => {};
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rec: any = null;
      let done = false;

      try {
        rec = new STTCtor();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 5;
        rec.continuous = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (event: any) => {
          if (done) return;
          done = true;
          if (!activeRef.current || sessionTokenRef.current !== token) return;
          const alts: string[] = [];
          for (let i = 0; i < event.results[0].length; i++) {
            alts.push(event.results[0][i].transcript.trim());
          }
          onResult(alts[0] ?? "");
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onerror = (event: any) => {
          if (done) return;
          done = true;
          if (!activeRef.current || sessionTokenRef.current !== token) return;
          const err = event.error;
          if (err === "aborted") return;
          if (err === "not-allowed" || err === "service-not-allowed") {
            onError(
              "Microphone access was denied. Please allow microphone access in your browser settings.",
              true
            );
          } else if (err === "no-speech") {
            onError("No speech was detected. Please try again.", false);
          } else if (err === "audio-capture") {
            onError(
              "No microphone found. Please connect a microphone and try again.",
              false
            );
          } else if (err === "network") {
            onError(
              "A network error occurred during speech recognition. Please check your connection.",
              false
            );
          } else {
            onError("Speech recognition failed. Please try again.", false);
          }
        };

        rec.onend = () => {
          if (!done) {
            done = true;
            if (activeRef.current && sessionTokenRef.current === token) {
              onError("No speech was detected. Please try again.", false);
            }
          }
        };

        activeRecognitionRef.current = rec;
        rec.start();
      } catch {
        done = true;
        if (activeRef.current && sessionTokenRef.current === token) {
          onError("Could not start microphone. Please try again.", false);
        }
      }

      return cancel;
    },
    [cancel, sttSupported, STTCtor]
  );

  return {
    ttsSupported,
    sttSupported,
    voiceAvailable,
    speak,
    listen,
    cancel,
    activeRef,
    sessionTokenRef,
  };
}

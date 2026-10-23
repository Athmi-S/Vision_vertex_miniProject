/**
 * useProfile.ts — Hook for reading and updating the learner's profile.
 *
 * Calls GET /profile to load learning_mode and language_pref.
 * Calls PUT /profile to save a new learning_mode (language_pref preserved
 * by omitting it from the request unless explicitly changed).
 *
 * The JWT is stored in an HttpOnly cookie — this hook never touches the
 * token directly; credentials: "include" ensures the browser sends it.
 */

import { useState, useCallback } from "react";

const API = "http://localhost:8000";

export interface LearnerProfile {
  user_id: number;
  username: string;
  email: string;
  learning_mode: "academic" | "competitive" | "topic" | null;
  language_pref: string;
}

export interface UseProfileReturn {
  profile: LearnerProfile | null;
  /** True while the initial GET /profile fetch is in flight. */
  loading: boolean;
  /** True while a PUT /profile save is in flight. */
  saving: boolean;
  /** Non-empty string when the last operation failed. */
  error: string;
  /** Non-empty string immediately after a successful save (clears on next call). */
  successMessage: string;
  /** Fetch the current profile from the backend. */
  fetchProfile: () => Promise<void>;
  /**
   * Save a new learning mode.
   * language_pref is intentionally omitted so the backend preserves
   * whatever the learner already has stored.
   */
  saveMode: (mode: LearnerProfile["learning_mode"]) => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const r = await fetch(`${API}/profile`, { credentials: "include" });
      if (r.status === 401) {
        // Caller (ModeSelectorPage) handles redirect to /login
        throw new Error("NOT_AUTHENTICATED");
      }
      if (!r.ok) {
        throw new Error("Failed to load your profile. Please try again.");
      }
      const data: LearnerProfile = await r.json();
      setProfile(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveMode = useCallback(
    async (mode: LearnerProfile["learning_mode"]) => {
      setSaving(true);
      setError("");
      setSuccessMessage("");
      try {
        const r = await fetch(`${API}/profile`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // language_pref intentionally omitted — backend preserves existing value
          body: JSON.stringify({ learning_mode: mode }),
        });
        if (r.status === 401) {
          throw new Error("NOT_AUTHENTICATED");
        }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const msg =
            typeof body.detail === "string"
              ? body.detail
              : body.detail?.[0]?.msg ?? "Save failed. Please try again.";
          throw new Error(msg);
        }
        const updated: LearnerProfile = await r.json();
        setProfile(updated);
        setSuccessMessage("Learning mode saved successfully.");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not save. Please try again."
        );
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return { profile, loading, saving, error, successMessage, fetchProfile, saveMode };
}

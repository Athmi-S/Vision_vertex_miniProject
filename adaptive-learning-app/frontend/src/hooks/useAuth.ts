/**
 * useAuth.ts — Authentication hook.
 *
 * Provides login, logout, register, and current-user state.
 * The JWT lives in an HttpOnly cookie managed by the backend —
 * this hook never touches the token directly.
 *
 * On mount it calls GET /auth/me to restore session state from the cookie.
 * The backend returns 401 if the cookie is absent or expired, in which case
 * `user` is set to null.
 */

import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore session by calling /auth/me
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const body = await r.json();
      throw new Error(body.detail ?? "Login failed.");
    }
    // After login, fetch current user profile
    const me = await fetch(`${API}/auth/me`, { credentials: "include" });
    setUser(me.ok ? await me.json() : null);
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const r = await fetch(`${API}/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      if (!r.ok) {
        const body = await r.json();
        // body.detail can be a string or a Pydantic validation array
        const msg =
          typeof body.detail === "string"
            ? body.detail
            : body.detail?.[0]?.msg ?? "Registration failed.";
        throw new Error(msg);
      }
    },
    []
  );

  return { user, loading, login, logout, register };
}

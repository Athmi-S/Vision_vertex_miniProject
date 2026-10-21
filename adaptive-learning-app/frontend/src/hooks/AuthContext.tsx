/**
 * AuthContext.tsx — Global authentication context.
 *
 * Wraps the entire app so every page shares the SAME auth state.
 * Without this, each page creates its own useAuth() instance and
 * calls /auth/me separately — causing race conditions on navigation.
 *
 * Usage:
 *   1. Wrap <App> with <AuthProvider> in main.tsx
 *   2. Call useAuth() anywhere — always returns the shared state
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const API = "http://localhost:8000";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider — mount once at the top of the tree
// ---------------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on app start (runs once)
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data ?? null))
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
      const body = await r.json().catch(() => ({}));
      throw new Error(body.detail ?? "Login failed.");
    }
    // Fetch the user object and store it in shared context
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
        const body = await r.json().catch(() => ({}));
        const msg =
          typeof body.detail === "string"
            ? body.detail
            : body.detail?.[0]?.msg ?? "Registration failed.";
        throw new Error(msg);
      }
    },
    []
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook — replaces the old useAuth.ts; reads from shared context
// ---------------------------------------------------------------------------
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

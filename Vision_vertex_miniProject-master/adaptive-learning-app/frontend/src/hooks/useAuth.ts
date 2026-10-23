/**
 * useAuth.ts — Re-exports useAuth from AuthContext.
 *
 * All pages import from this file — they automatically get the
 * shared context version (no per-page /auth/me calls, no race conditions).
 */
export { useAuth } from "./AuthContext";
export type { AuthUser } from "./AuthContext";

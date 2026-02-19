/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PHASE 1 — User Session Store  (src/store/userStore.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Volatile session state — lives ONLY in memory (Zustand).
 *
 * Critical security property:
 *   The Master Key is stored here as an ArrayBuffer. It is NEVER written to
 *   localStorage, sessionStorage, IndexedDB, or any persistent storage.
 *   Refreshing the page or closing the tab → key is gone → session expired.
 *
 * State machine:
 *   "unauthenticated"  →  (login/register)  →  "authenticated"
 *   "authenticated"    →  (logout/refresh)   →  "unauthenticated"
 *   Any state          →  (error)            →  "error"
 *
 * This store is the single source of truth for:
 *   - Whether a user is logged in
 *   - Who the current user is
 *   - The volatile master key (for future OPFS encryption)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { create } from "zustand";

// ── Types ───────────────────────────────────────────────────────────────────

export type SessionStatus =
  | "unauthenticated"   // No active session
  | "authenticating"    // Login/register in progress
  | "initializing"      // Auth succeeded, setting up FS/services
  | "authenticated"     // Fully ready
  | "error";            // Auth or init failed

export interface UserSession {
  userId: string;
  /** Volatile master key — NEVER persisted */
  masterKey: ArrayBuffer;
  /** Timestamp of login */
  loginAt: number;
}

export interface UserState {
  // ── Session ───────────────────────────────────────────────
  session: UserSession | null;
  status: SessionStatus;
  error: string | null;

  // ── Known users (from IndexedDB, not sensitive) ───────────
  knownUsers: string[];

  // ── Actions ───────────────────────────────────────────────
  setSession: (session: UserSession) => void;
  clearSession: () => void;
  setStatus: (status: SessionStatus, error?: string) => void;
  setKnownUsers: (users: string[]) => void;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useUserStore = create<UserState>((set) => ({
  session: null,
  status: "unauthenticated",
  error: null,
  knownUsers: [],

  /** Set the authenticated session (stores master key in volatile RAM). */
  setSession: (session) =>
    set({
      session,
      status: "authenticated",
      error: null,
    }),

  /** Clear the session entirely — master key is discarded from memory. */
  clearSession: () =>
    set({
      session: null,
      status: "unauthenticated",
      error: null,
    }),

  /** Transition to a new status, optionally attaching an error message. */
  setStatus: (status, error) =>
    set({
      status,
      error: error ?? null,
    }),

  /** Update the list of known userIds (loaded from IndexedDB on mount). */
  setKnownUsers: (users) =>
    set({ knownUsers: users }),
}));

// ── Selectors (for performance — avoid unnecessary re-renders) ──────────────

/** Selector: true only when status is "authenticated" AND a session exists. */
export const selectIsAuthenticated = (state: UserState) =>
  state.status === "authenticated" && state.session !== null;

/** Selector: return the current userId or null if no session. */
export const selectUserId = (state: UserState) =>
  state.session?.userId ?? null;

/** Selector: return the raw session status string. */
export const selectSessionStatus = (state: UserState) => state.status;

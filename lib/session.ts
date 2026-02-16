/**
 * Session management — stored in sessionStorage for tab-scoped lifetime.
 *
 * A session contains:
 *   - username   : the authenticated user
 *   - token      : a 256-bit random hex token
 *   - createdAt  : ISO-8601 timestamp
 *   - expiresAt  : ISO-8601 timestamp (24 h after creation)
 */

import { generateSessionToken } from "./crypto";

const SESSION_KEY = "southstack-session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Types ──────────────────────────────────────────────────

export interface Session {
  username: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Create a new session and persist it to sessionStorage.
 */
export function createSession(username: string): Session {
  const now = Date.now();
  const session: Session = {
    username,
    token: generateSessionToken(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DURATION_MS).toISOString(),
  };

  if (typeof window !== "undefined") {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  return session;
}

/**
 * Retrieve the current session from sessionStorage.
 *
 * @returns The session, or `null` if none exists.
 */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/**
 * Check whether a session exists AND has not expired.
 */
export function isSessionValid(): boolean {
  const session = getSession();
  if (!session) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}

/**
 * Destroy the current session.
 */
export function clearSession(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

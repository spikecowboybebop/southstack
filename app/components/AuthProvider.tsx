"use client";

/**
 * AuthProvider — React context for offline-first authentication.
 *
 * Wraps the app to provide:
 *   - Current session state (user, loading, error)
 *   - signup(), login(), logout() actions
 *   - Automatic session validation on mount (24-hour expiry)
 *
 * Usage:
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 *
 *   const { user, isAuthenticated, signup, login, logout } = useAuth();
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { login as doLogin, signup as doSignup } from "@/lib/auth";
import type { AuthErrorCode } from "@/lib/db";
import {
    deriveEncryptionKey,
    exportKeyHex,
    hashUsername,
    importKeyHex,
} from "@/lib/opfs-crypto";
import { clearSession, getSession, isSessionValid, type Session } from "@/lib/session";

// ─── Types ──────────────────────────────────────────────────

export interface AuthState {
  /** The current session, or null if unauthenticated. */
  session: Session | null;
  /** The authenticated username, or null. */
  user: string | null;
  /** SHA-256 hash of the username — used as OPFS folder name. */
  userHash: string | null;
  /** AES-GCM encryption key for file content — volatile, never in localStorage. */
  encryptionKey: CryptoKey | null;
  /** True once the component has mounted on the client (hydration guard). */
  mounted: boolean;
  /** True while the initial session check is running. */
  isLoading: boolean;
  /** True when an auth operation (login/signup) is in progress. */
  isSubmitting: boolean;
  /** Whether the user is currently authenticated with a valid session. */
  isAuthenticated: boolean;
  /** Alias for isAuthenticated — convenience for templates. */
  isLoggedIn: boolean;
  /** Last error from a signup/login attempt. */
  error: AuthErrorInfo | null;
  /** Clear the current error. */
  clearError: () => void;
  /** Sign up a new user. */
  signup: (username: string, password: string) => Promise<boolean>;
  /** Log in an existing user. */
  login: (username: string, password: string) => Promise<boolean>;
  /** Destroy the session and log out. */
  logout: () => void;
}

export interface AuthErrorInfo {
  code: AuthErrorCode | "UNKNOWN";
  message: string;
}

// ─── Context ────────────────────────────────────────────────

const ENC_KEY_STORAGE = "southstack-enc-key";
const USER_HASH_STORAGE = "southstack-user-hash";

const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ───────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AuthErrorInfo | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [userHash, setUserHash] = useState<string | null>(null);

  // Hydration guard — marks the client as mounted so auth-dependent
  // UI can safely render without causing a server/client mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check for an existing valid session on mount.
  // Restores the encryption key and user hash from sessionStorage.
  useEffect(() => {
    async function restoreSession() {
      if (isSessionValid()) {
        const s = getSession();
        setSession(s);

        // Restore encryption key + user hash from sessionStorage
        const keyHex = sessionStorage.getItem(ENC_KEY_STORAGE);
        const hash = sessionStorage.getItem(USER_HASH_STORAGE);

        if (keyHex && hash) {
          try {
            const key = await importKeyHex(keyHex);
            setEncryptionKey(key);
            setUserHash(hash);
          } catch {
            // Key restore failed — force re-login
            clearSession();
            sessionStorage.removeItem(ENC_KEY_STORAGE);
            sessionStorage.removeItem(USER_HASH_STORAGE);
            setSession(null);
          }
        } else if (s?.username) {
          // Session exists but no key — compute hash, key stays null
          // (files may be unreadable until re-login, but user hash is recoverable)
          const h = await hashUsername(s.username);
          setUserHash(h);
        }
      } else {
        clearSession();
        sessionStorage.removeItem(ENC_KEY_STORAGE);
        sessionStorage.removeItem(USER_HASH_STORAGE);
      }
      setIsLoading(false);
    }
    restoreSession();
  }, []);

  // ── Actions ──

  const clearError = useCallback(() => setError(null), []);

  const signup = useCallback(async (username: string, password: string): Promise<boolean> => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await doSignup(username, password);
      setSession(result.session);

      // Derive encryption key + user hash (password is in scope here only)
      const [key, hash] = await Promise.all([
        deriveEncryptionKey(password, username),
        hashUsername(username),
      ]);
      setEncryptionKey(key);
      setUserHash(hash);

      // Persist key material in sessionStorage (tab-scoped, never localStorage)
      const keyHex = await exportKeyHex(key);
      sessionStorage.setItem(ENC_KEY_STORAGE, keyHex);
      sessionStorage.setItem(USER_HASH_STORAGE, hash);

      return true;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError({
        code: (e.code as AuthErrorCode) ?? "UNKNOWN",
        message: e.message ?? "An unexpected error occurred.",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await doLogin(username, password);
      setSession(result.session);

      // Derive encryption key + user hash (password is in scope here only)
      const [key, hash] = await Promise.all([
        deriveEncryptionKey(password, username),
        hashUsername(username),
      ]);
      setEncryptionKey(key);
      setUserHash(hash);

      // Persist key material in sessionStorage (tab-scoped, never localStorage)
      const keyHex = await exportKeyHex(key);
      sessionStorage.setItem(ENC_KEY_STORAGE, keyHex);
      sessionStorage.setItem(USER_HASH_STORAGE, hash);

      return true;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError({
        code: (e.code as AuthErrorCode) ?? "UNKNOWN",
        message: e.message ?? "An unexpected error occurred.",
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setEncryptionKey(null);
    setUserHash(null);
    setError(null);

    // Wipe encryption key from sessionStorage
    sessionStorage.removeItem(ENC_KEY_STORAGE);
    sessionStorage.removeItem(USER_HASH_STORAGE);
  }, []);

  // ── Memo ──

  const isAuthenticated = !!session && isSessionValid();

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.username ?? null,
      userHash,
      encryptionKey,
      mounted,
      isLoading,
      isSubmitting,
      isAuthenticated,
      isLoggedIn: isAuthenticated,
      error,
      clearError,
      signup,
      login,
      logout,
    }),
    [session, userHash, encryptionKey, mounted, isLoading, isSubmitting, isAuthenticated, error, clearError, signup, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────

/**
 * Access the auth state and actions from any client component.
 *
 * Must be used inside an <AuthProvider>.
 *
 * @example
 * const { user, isAuthenticated, login, logout, error } = useAuth();
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used within an <AuthProvider>.");
  }
  return ctx;
}

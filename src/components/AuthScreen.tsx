/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUTH SCREEN — Login / Register  (src/components/AuthScreen.tsx)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Shown when user is NOT authenticated.
 *   • If no known users → Register mode
 *   • If known users exist → Login mode (with switch to Register)
 *   • Zero-knowledge: password never stored, only PBKDF2 hash
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect } from "react";
import type { AetherSystem } from "../hooks/useAetherSystem";

interface AuthScreenProps {
  system: AetherSystem;
}

type AuthMode = "login" | "register";

/** Auth gate UI — renders login form or registration form based on existing users. */
export default function AuthScreen({ system }: AuthScreenProps) {
  const { status, error, knownUsers, register, login, deleteAccount } = system;

  // Auto‑pick mode: if no users exist → register, else login
  const [mode, setMode] = useState<AuthMode>(
    knownUsers.length === 0 ? "register" : "login"
  );
  const [userId, setUserId] = useState(knownUsers[0] ?? "");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync mode when knownUsers changes (e.g. after delete)
  useEffect(() => {
    if (knownUsers.length === 0) {
      setMode("register");
      setUserId("");
    }
  }, [knownUsers]);

  const busy = status === "authenticating" || status === "initializing";

  // ── Submit ───────────────────────────────────────────────────────────
  /** Validate inputs and call register() or login() via the auth system. */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);

      if (!userId.trim()) {
        setLocalError("Username is required.");
        return;
      }
      if (userId.trim().length < 2) {
        setLocalError("Username must be at least 2 characters.");
        return;
      }
      if (!password) {
        setLocalError("Password is required.");
        return;
      }
      if (password.length < 4) {
        setLocalError("Password must be at least 4 characters.");
        return;
      }

      if (mode === "register") {
        if (password !== confirmPw) {
          setLocalError("Passwords do not match.");
          return;
        }
        try {
          await register(userId.trim(), password);
        } catch (err) {
          setLocalError(
            err instanceof Error ? err.message : "Registration failed."
          );
        }
      } else {
        try {
          await login(userId.trim(), password);
        } catch (err) {
          setLocalError(
            err instanceof Error ? err.message : "Login failed."
          );
        }
      }
    },
    [userId, password, confirmPw, mode, register, login]
  );

  // ── Delete user ──────────────────────────────────────────────────────
  /** Prompt for confirmation, then permanently delete a user and their data. */
  const handleDelete = useCallback(
    async (uid: string) => {
      if (!confirm(`Permanently delete user "${uid}" and all their data?`)) return;
      try {
        await deleteAccount(uid);
        if (userId === uid) setUserId(knownUsers[0] ?? "");
      } catch {
        setLocalError("Failed to delete account.");
      }
    },
    [deleteAccount, userId, knownUsers]
  );

  const displayError = localError || error;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="auth-backdrop">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">⚡</span>
          <span className="auth-logo-text">SouthStack</span>
        </div>
        <p className="auth-subtitle">Zero-Knowledge Offline IDE</p>

        {/* Mode tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "login" ? "auth-tab-active" : ""}`}
            onClick={() => {
              setMode("login");
              setLocalError(null);
              setPassword("");
              setConfirmPw("");
            }}
            disabled={knownUsers.length === 0}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === "register" ? "auth-tab-active" : ""}`}
            onClick={() => {
              setMode("register");
              setLocalError(null);
              setPassword("");
              setConfirmPw("");
              setUserId("");
            }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          {/* User selector (login mode with existing users) */}
          {mode === "login" && knownUsers.length > 0 ? (
            <div className="auth-field">
              <label className="auth-label">User</label>
              <div className="auth-user-list">
                {knownUsers.map((uid) => (
                  <div
                    key={uid}
                    className={`auth-user-item ${userId === uid ? "auth-user-selected" : ""}`}
                    onClick={() => setUserId(uid)}
                  >
                    <span className="auth-user-avatar">
                      {uid.charAt(0).toUpperCase()}
                    </span>
                    <span className="auth-user-name">{uid}</span>
                    <button
                      type="button"
                      className="auth-user-delete"
                      title={`Delete ${uid}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(uid);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-uid">
                Username
              </label>
              <input
                id="auth-uid"
                className="auth-input"
                type="text"
                placeholder="e.g. developer"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                autoFocus
                disabled={busy}
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-pw">
              Password
            </label>
            <input
              id="auth-pw"
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-cpw">
                Confirm Password
              </label>
              <input
                id="auth-cpw"
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                disabled={busy}
              />
            </div>
          )}

          {/* Error */}
          {displayError && (
            <div className="auth-error">{displayError}</div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={busy}
          >
            {busy
              ? status === "authenticating"
                ? "Deriving key…"
                : "Initializing…"
              : mode === "register"
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>

        <p className="auth-footer">
          Your password never leaves this device.
          <br />
          All data is stored locally via OPFS.
        </p>
      </div>
    </div>
  );
}

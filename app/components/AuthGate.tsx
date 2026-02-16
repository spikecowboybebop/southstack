"use client";

/**
 * AuthGate — Login / Signup form component.
 *
 * Can be used standalone on /login and /signup pages with `defaultMode`,
 * or as a wrapper that shows children only when authenticated.
 */

import { AUTH_LIMITS } from "@/lib/validation";
import { AlertCircle, Eye, EyeOff, Loader2, Terminal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";

interface AuthGateProps {
  children: ReactNode;
  /** Initial form mode when used as a standalone page. */
  defaultMode?: "login" | "signup";
}

export default function AuthGate({ children, defaultMode = "login" }: AuthGateProps) {
  const { isAuthenticated, isLoading, isSubmitting, error, clearError, signup, login } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(defaultMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameLimitHit, setUsernameLimitHit] = useState(false);
  const [passwordLimitHit, setPasswordLimitHit] = useState(false);

  // Enforce max length via React state — strip whitespace, hard substring
  function handleUsernameChange(value: string) {
    const clamped = value.slice(0, 50).replace(/\s/g, "");
    setUsername(clamped);
    setUsernameLimitHit(value.length >= AUTH_LIMITS.USERNAME_MAX);
  }

  function handlePasswordChange(value: string) {
    const clamped = value.substring(0, AUTH_LIMITS.PASSWORD_MAX);
    setPassword(clamped);
    setPasswordLimitHit(value.length >= AUTH_LIMITS.PASSWORD_MAX);
  }

  // Show nothing while checking session
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-indigo" />
      </div>
    );
  }

  // Authenticated — render children (if used as a wrapper)
  if (isAuthenticated && children) {
    return <>{children}</>;
  }

  // ── Form handler ──

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Hard guard — block processing if state was somehow manipulated
    if (username.length > AUTH_LIMITS.USERNAME_MAX || password.length > AUTH_LIMITS.PASSWORD_MAX) return;
    if (username.length < 1 || password.length < AUTH_LIMITS.PASSWORD_MIN) return;

    const action = mode === "signup" ? signup : login;
    const ok = await action(username, password);
    if (ok) {
      router.push("/editor");
    }
  }

  function toggleMode() {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setUsername("");
    setPassword("");
    clearError();
    setUsernameLimitHit(false);
    setPasswordLimitHit(false);
  }

  // ── Auth UI ──

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-indigo/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo text-white">
            <Terminal className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted">
            {mode === "login"
              ? "Sign in to launch SouthStack"
              : "All data stays on your device — always"}
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="h-auto rounded-2xl border border-border bg-surface p-8 shadow-xl shadow-black/20"
        >
          {/* Error banner */}
          {error && (
            <div className="mb-6 flex min-h-fit items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 whitespace-normal break-words">
                {error.message.length > 120
                  ? "Invalid input. Please check your credentials."
                  : error.message}
              </span>
            </div>
          )}

          {/* Username */}
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Username
          </label>
          <input
            type="text"
            required
            autoComplete="username"
            maxLength={AUTH_LIMITS.USERNAME_MAX}
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            placeholder="e.g. devhacker"
            className="mb-1 w-full rounded-lg border border-border-light bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-indigo focus:ring-1 focus:ring-indigo"
          />
          <div className="mb-4 flex items-center justify-between">
            {usernameLimitHit ? (
              <span className="text-[11px] text-amber-400">Character limit reached</span>
            ) : (
              <span />
            )}
            <span className="text-[11px] text-muted/50">
              {username.length}/{AUTH_LIMITS.USERNAME_MAX}
            </span>
          </div>

          {/* Password */}
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Password
          </label>
          <div className="relative mb-1">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={AUTH_LIMITS.PASSWORD_MIN}
              maxLength={AUTH_LIMITS.PASSWORD_MAX}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg border border-border-light bg-background px-4 py-2.5 pr-11 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-indigo focus:ring-1 focus:ring-indigo"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mb-5 flex items-center justify-between">
            {passwordLimitHit ? (
              <span className="text-[11px] text-amber-400">Character limit reached</span>
            ) : (
              <span />
            )}
            <span className="text-[11px] text-muted/50">
              {password.length}/{AUTH_LIMITS.PASSWORD_MAX}
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-light hover:shadow-lg hover:shadow-indigo-glow disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === "signup" ? "Creating account…" : "Signing in…"}
              </>
            ) : mode === "signup" ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </button>

          {/* Toggle mode */}
          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <Link
              href={mode === "login" ? "/signup" : "/login"}
              onClick={(e) => {
                e.preventDefault();
                toggleMode();
              }}
              className="font-medium text-indigo transition-colors hover:text-indigo-light"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </Link>
          </p>
        </form>

        {/* Security note */}
        <p className="mt-6 text-center text-xs text-muted/50">
          🔒 Your password is hashed with PBKDF2 (100k iterations) and never leaves this device.
        </p>
      </div>
    </div>
  );
}

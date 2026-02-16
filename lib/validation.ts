/**
 * Auth validation — Zod schemas + frozen security constants.
 *
 * This module is the single source of truth for all input constraints
 * and security parameters. Constants are frozen so they cannot be
 * mutated from the browser console at runtime.
 */

import { z } from "zod";

// ─── Immutable Security Config ──────────────────────────────

/**
 * Frozen security constants.
 * `Object.freeze` prevents runtime mutation via DevTools.
 */
export const AUTH_LIMITS = Object.freeze({
  /** Min username length */
  USERNAME_MIN: 3,
  /** Max username length */
  USERNAME_MAX: 50,
  /** Min password length */
  PASSWORD_MIN: 8,
  /** Max password length (prevents CPU exhaustion on PBKDF2) */
  PASSWORD_MAX: 128,
  /** PBKDF2 iteration count */
  PBKDF2_ITERATIONS: 100_000,
  /** Salt length in bytes */
  SALT_BYTES: 32,
  /** Derived key length in bits */
  HASH_BITS: 256,
});

// ─── Zod Schemas ────────────────────────────────────────────

const usernameSchema = z
  .string()
  .min(AUTH_LIMITS.USERNAME_MIN, `Username must be at least ${AUTH_LIMITS.USERNAME_MIN} characters.`)
  .max(AUTH_LIMITS.USERNAME_MAX, `Username must be at most ${AUTH_LIMITS.USERNAME_MAX} characters.`)
  .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores.");

const passwordSchema = z
  .string()
  .min(AUTH_LIMITS.PASSWORD_MIN, `Password must be at least ${AUTH_LIMITS.PASSWORD_MIN} characters.`)
  .max(AUTH_LIMITS.PASSWORD_MAX, `Password must be at most ${AUTH_LIMITS.PASSWORD_MAX} characters.`);

export const authInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type AuthInput = z.infer<typeof authInputSchema>;

// ─── Validation Function ────────────────────────────────────

export interface ValidationError {
  field: "username" | "password" | "general";
  message: string;
}

/**
 * Validate raw auth input **before** any hashing or DB access.
 *
 * Call this at the very start of `signup()` / `login()`.
 *
 * @throws {AuthValidationError} with structured field errors.
 */
export function validateAuthInput(data: { username: string; password: string }): AuthInput {
  // ── Hardcoded guardrails (defense-in-depth) ──
  // Even if Zod is bypassed via debugger, these will catch oversized input.
  if (typeof data.username !== "string" || data.username.length > AUTH_LIMITS.USERNAME_MAX) {
    throw new AuthValidationError([
      { field: "username", message: `Username must not exceed ${AUTH_LIMITS.USERNAME_MAX} characters.` },
    ]);
  }
  if (typeof data.password !== "string" || data.password.length > AUTH_LIMITS.PASSWORD_MAX) {
    throw new AuthValidationError([
      { field: "password", message: `Password must not exceed ${AUTH_LIMITS.PASSWORD_MAX} characters.` },
    ]);
  }

  // ── Zod parse ──
  const result = authInputSchema.safeParse(data);

  if (!result.success) {
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      field: (issue.path[0] as ValidationError["field"]) ?? "general",
      message: issue.message,
    }));
    throw new AuthValidationError(errors);
  }

  return result.data;
}

// ─── Error Class ────────────────────────────────────────────

export class AuthValidationError extends Error {
  errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super(errors.map((e) => e.message).join(" "));
    this.name = "AuthValidationError";
    this.errors = errors;
  }
}

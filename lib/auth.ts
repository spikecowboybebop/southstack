/**
 * High-level authentication operations.
 *
 * Orchestrates validation → crypto → IndexedDB → session.
 * Every function calls `validateAuthInput()` FIRST — before any
 * PBKDF2 hashing or DB access — to block oversized / malformed input.
 *
 * Sensitive variables (salt, hash, keyMaterial) are scoped inside
 * these functions and never exposed to the global `window` object.
 */

import { generateSalt, hashPassword, timingSafeEqual } from "./crypto";
import { AuthError, createUser, getUser } from "./db";
import { createSession, type Session } from "./session";
import {
    AUTH_LIMITS,
    AuthValidationError,
    validateAuthInput,
} from "./validation";

// ─── Signup ─────────────────────────────────────────────────

export interface SignupResult {
  session: Session;
  username: string;
}

/**
 * Register a new user.
 *
 * 1. Validates input via Zod + hardcoded guardrails
 * 2. Generates a 256-bit salt via crypto.getRandomValues()
 * 3. Derives a PBKDF2 hash (100 000 iterations, SHA-256)
 * 4. Stores { username, salt, hash } in IndexedDB
 * 5. Creates and returns a session
 *
 * @throws AuthValidationError if input fails schema/length checks
 * @throws AuthError("USERNAME_TAKEN") if user already exists
 */
export async function signup(
  username: string,
  password: string
): Promise<SignupResult> {
  // ── HARDCODED GUARDRAILS (defense-in-depth) ──
  // These fire before ANYTHING else, even if Zod or React state is bypassed.
  if (typeof username !== "string" || username.length > AUTH_LIMITS.USERNAME_MAX) {
    throw new AuthError("DB_ERROR", `Username must not exceed ${AUTH_LIMITS.USERNAME_MAX} characters.`);
  }
  if (typeof password !== "string" || password.length > AUTH_LIMITS.PASSWORD_MAX) {
    throw new AuthError("DB_ERROR", `Password must not exceed ${AUTH_LIMITS.PASSWORD_MAX} characters.`);
  }

  // ── Zod validation (schema + regex) ──
  const validated = validateAuthInput({ username, password });

  // 1. Generate salt (scoped — never on `window`)
  const salt = generateSalt();

  // 2. Hash password with PBKDF2
  const hash = await hashPassword(validated.password, salt);

  // 3. Persist to IndexedDB (throws if username taken)
  await createUser({ username: validated.username, salt, hash });

  // 4. Create session
  const session = createSession(validated.username);

  return { session, username: validated.username };
}

// ─── Login ──────────────────────────────────────────────────

export interface LoginResult {
  session: Session;
  username: string;
}

/**
 * Authenticate an existing user.
 *
 * 1. Validates input via Zod + hardcoded guardrails
 * 2. Retrieves the user's salt from IndexedDB
 * 3. Re-hashes the input password with that salt
 * 4. Compares hashes using constant-time comparison
 * 5. On success, creates and returns a session
 *
 * @throws AuthValidationError if input fails schema/length checks
 * @throws AuthError("USER_NOT_FOUND")      if username doesn't exist
 * @throws AuthError("INCORRECT_PASSWORD")   if hashes don't match
 */
export async function login(
  username: string,
  password: string
): Promise<LoginResult> {
  // ── HARDCODED GUARDRAILS ──
  if (typeof username !== "string" || username.length > AUTH_LIMITS.USERNAME_MAX) {
    throw new AuthError("DB_ERROR", `Username must not exceed ${AUTH_LIMITS.USERNAME_MAX} characters.`);
  }
  if (typeof password !== "string" || password.length > AUTH_LIMITS.PASSWORD_MAX) {
    throw new AuthError("DB_ERROR", `Password must not exceed ${AUTH_LIMITS.PASSWORD_MAX} characters.`);
  }

  // ── Zod validation ──
  const validated = validateAuthInput({ username, password });

  // 1. Look up user
  const user = await getUser(validated.username);
  if (!user) {
    throw new AuthError(
      "USER_NOT_FOUND",
      "No account found for that username."
    );
  }

  // 2. Re-hash the provided password with the stored salt
  const hash = await hashPassword(validated.password, user.salt);

  // 3. Constant-time comparison
  if (!timingSafeEqual(hash, user.hash)) {
    throw new AuthError(
      "INCORRECT_PASSWORD",
      "The password you entered is incorrect."
    );
  }

  // 4. Create session
  const session = createSession(validated.username);

  return { session, username: validated.username };
}

// Re-export for convenience
export { AuthValidationError };

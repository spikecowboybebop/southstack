/**
 * High-level authentication operations.
 *
 * Orchestrates crypto, IndexedDB, and session management.
 * Every function is async — no plaintext passwords are ever stored.
 */

import { generateSalt, hashPassword, timingSafeEqual } from "./crypto";
import { AuthError, createUser, getUser } from "./db";
import { createSession, type Session } from "./session";

// ─── Signup ─────────────────────────────────────────────────

export interface SignupResult {
  session: Session;
  username: string;
}

/**
 * Register a new user.
 *
 * 1. Generates a 256-bit salt via crypto.getRandomValues()
 * 2. Derives a PBKDF2 hash (100 000 iterations, SHA-256)
 * 3. Stores { username, salt, hash } in IndexedDB
 * 4. Creates and returns a session
 *
 * @throws AuthError("USERNAME_TAKEN") if user already exists
 */
export async function signup(
  username: string,
  password: string
): Promise<SignupResult> {
  // Input validation
  const trimmed = username.trim();
  if (!trimmed) throw new AuthError("DB_ERROR", "Username cannot be empty.");
  if (password.length < 8)
    throw new AuthError("DB_ERROR", "Password must be at least 8 characters.");

  // 1. Generate salt
  const salt = generateSalt();

  // 2. Hash password with PBKDF2
  const hash = await hashPassword(password, salt);

  // 3. Persist to IndexedDB (throws if username taken)
  await createUser({ username: trimmed, salt, hash });

  // 4. Create session
  const session = createSession(trimmed);

  return { session, username: trimmed };
}

// ─── Login ──────────────────────────────────────────────────

export interface LoginResult {
  session: Session;
  username: string;
}

/**
 * Authenticate an existing user.
 *
 * 1. Retrieves the user's salt from IndexedDB
 * 2. Re-hashes the input password with that salt
 * 3. Compares hashes using constant-time comparison
 * 4. On success, creates and returns a session
 *
 * @throws AuthError("USER_NOT_FOUND")      if username doesn't exist
 * @throws AuthError("INCORRECT_PASSWORD")   if hashes don't match
 */
export async function login(
  username: string,
  password: string
): Promise<LoginResult> {
  const trimmed = username.trim();
  if (!trimmed) throw new AuthError("DB_ERROR", "Username cannot be empty.");

  // 1. Look up user
  const user = await getUser(trimmed);
  if (!user) {
    throw new AuthError(
      "USER_NOT_FOUND",
      `No account found for "${trimmed}".`
    );
  }

  // 2. Re-hash the provided password with the stored salt
  const hash = await hashPassword(password, user.salt);

  // 3. Constant-time comparison
  if (!timingSafeEqual(hash, user.hash)) {
    throw new AuthError(
      "INCORRECT_PASSWORD",
      "The password you entered is incorrect."
    );
  }

  // 4. Create session
  const session = createSession(trimmed);

  return { session, username: trimmed };
}

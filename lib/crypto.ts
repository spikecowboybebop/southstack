/**
 * Web Crypto API utilities for offline-first authentication.
 *
 * All operations are async and never expose plaintext passwords.
 * Uses PBKDF2 with SHA-256 and the iteration count from AUTH_LIMITS.
 *
 * Sensitive crypto variables (keyMaterial, derivedBits, salt arrays)
 * are scoped inside their respective functions and never leak to
 * `window` or module scope.
 */

import { AUTH_LIMITS } from "./validation";

// ─── Private Helpers (not exported, not on window) ──────────

/** Encode a string as a Uint8Array (UTF-8). */
function encode(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** Convert an ArrayBuffer to a hex string for storage / comparison. */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convert a hex string back to an ArrayBuffer. */
function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Generate a cryptographically random salt.
 *
 * @returns Hex-encoded 256-bit salt.
 */
export function generateSalt(): string {
  const salt = new Uint8Array(AUTH_LIMITS.SALT_BYTES);
  crypto.getRandomValues(salt);
  const hex = bufferToHex(salt.buffer as ArrayBuffer);
  // `salt` stays scoped — no global leaks
  return hex;
}

/**
 * Generate a cryptographically random session token.
 *
 * @returns Hex-encoded 256-bit token.
 */
export function generateSessionToken(): string {
  const token = new Uint8Array(32);
  crypto.getRandomValues(token);
  const hex = bufferToHex(token.buffer as ArrayBuffer);
  return hex;
}

/**
 * Derive a PBKDF2 hash from a password and salt.
 *
 * Hardcoded length guard: rejects passwords over AUTH_LIMITS.PASSWORD_MAX
 * before touching Web Crypto, making CPU exhaustion impossible.
 *
 * @param password  Plaintext password (never stored).
 * @param saltHex   Hex-encoded salt.
 * @returns         Hex-encoded derived key.
 */
export async function hashPassword(
  password: string,
  saltHex: string
): Promise<string> {
  // ── Hardcoded internal guardrail ──
  if (password.length > AUTH_LIMITS.PASSWORD_MAX) {
    throw new Error("Password exceeds maximum allowed length.");
  }

  // 1. Import the password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encode(password),
    "PBKDF2",
    false, // not extractable
    ["deriveBits"]
  );

  // 2. Derive bits using PBKDF2 + SHA-256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBuffer(saltHex),
      iterations: AUTH_LIMITS.PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    AUTH_LIMITS.HASH_BITS
  );

  // keyMaterial and derivedBits stay scoped to this function
  return bufferToHex(derivedBits);
}

/**
 * Constant-time comparison of two hex strings.
 * Prevents timing attacks when verifying password hashes.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

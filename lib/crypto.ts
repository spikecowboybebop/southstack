/**
 * Web Crypto API utilities for offline-first authentication.
 *
 * All operations are async and never expose plaintext passwords.
 * Uses PBKDF2 with SHA-256 and a minimum of 100 000 iterations.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 32; // 256-bit salt
const HASH_LENGTH = 256; // 256-bit derived key

// ─── Helpers ────────────────────────────────────────────────

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
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  return bufferToHex(salt.buffer as ArrayBuffer);
}

/**
 * Generate a cryptographically random session token.
 *
 * @returns Hex-encoded 256-bit token.
 */
export function generateSessionToken(): string {
  const token = new Uint8Array(32);
  crypto.getRandomValues(token);
  return bufferToHex(token.buffer as ArrayBuffer);
}

/**
 * Derive a PBKDF2 hash from a password and salt.
 *
 * @param password  Plaintext password (never stored).
 * @param saltHex   Hex-encoded salt.
 * @returns         Hex-encoded derived key.
 */
export async function hashPassword(
  password: string,
  saltHex: string
): Promise<string> {
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
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_LENGTH
  );

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

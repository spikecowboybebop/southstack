/**
 * OPFS Crypto — SHA-256 username hashing + AES-GCM file encryption.
 *
 * Provides user-scoped sandboxing for OPFS:
 *   - hashUsername()       → SHA-256 hex (used as OPFS root folder name)
 *   - deriveEncryptionKey()→ PBKDF2 → AES-GCM-256 CryptoKey
 *   - exportKeyHex()      → export CryptoKey to hex for sessionStorage
 *   - importKeyHex()      → re-import hex as CryptoKey on session restore
 *   - encryptContent()    → AES-GCM encrypt (12-byte IV prepended, base64)
 *   - decryptContent()    → AES-GCM decrypt
 *
 * The encryption key is derived from the user's password + a purpose salt.
 * It is NEVER persisted to localStorage or cookies — only held in React
 * state or sessionStorage (tab-scoped, cleared on tab close / logout).
 */

const ENC_PURPOSE = "southstack-file-encryption";
const PBKDF2_ENC_ITERATIONS = 100_000;

// ─── Helpers ────────────────────────────────────────────────

function encode(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a username → hex string.
 * Used as the OPFS root directory name for that user.
 * Prevents anyone from identifying user folders by name.
 */
export async function hashUsername(username: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encode(username));
  return bufferToHex(hash);
}

/**
 * Derive an AES-GCM-256 encryption key from the user's password.
 *
 * Uses PBKDF2 with a purpose-specific salt: SHA-256(username + purpose).
 * This produces a DIFFERENT key than the auth hash (which uses its own salt).
 *
 * The key is extractable so it can be exported to sessionStorage
 * for tab-scoped persistence across client-side navigations.
 */
export async function deriveEncryptionKey(
  password: string,
  username: string
): Promise<CryptoKey> {
  // Purpose-specific salt: SHA-256(username + purpose)
  const saltInput = username + ENC_PURPOSE;
  const salt = await crypto.subtle.digest("SHA-256", encode(saltInput));

  // Import password as PBKDF2 key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive AES-GCM-256 key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ENC_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed for sessionStorage export
    ["encrypt", "decrypt"]
  );
}

/**
 * Export a CryptoKey as a hex string for sessionStorage persistence.
 */
export async function exportKeyHex(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToHex(raw);
}

/**
 * Re-import a hex-encoded AES-GCM-256 key from sessionStorage.
 */
export async function importKeyHex(hex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    hexToBuffer(hex),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt plaintext with AES-GCM.
 * Returns a base64-encoded string: 12-byte IV + ciphertext.
 */
export async function encryptContent(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encode(plaintext)
  );

  // Concatenate IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bufferToBase64(combined.buffer as ArrayBuffer);
}

/**
 * Decrypt an AES-GCM encrypted string.
 * Expects base64-encoded: 12-byte IV + ciphertext.
 */
export async function decryptContent(
  encoded: string,
  key: CryptoKey
): Promise<string> {
  const combined = new Uint8Array(base64ToBuffer(encoded));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

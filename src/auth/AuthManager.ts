/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PHASE 1 — AuthManager  (src/auth/AuthManager.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Zero-Knowledge Authentication — 100% local, no backend.
 *
 * Architecture:
 *   1. REGISTRATION
 *      - Generate a 16-byte random Salt via crypto.getRandomValues()
 *      - Derive a 256-bit Master Key via PBKDF2 (SHA-256, 100,000 iterations)
 *        from Password + Salt
 *      - Hash the Master Key (SHA-256) → Verifier Hash
 *      - Store { userId, salt, verifierHash } in IndexedDB
 *      - Return the raw Master Key to be held in volatile memory (Zustand)
 *
 *   2. LOGIN
 *      - Retrieve salt for userId from IndexedDB
 *      - Re-derive Master Key from Password + salt
 *      - Hash the derived key → compare against stored Verifier Hash
 *      - If match → return Master Key; else → throw
 *
 *   3. SESSION SECURITY
 *      - The Master Key is NEVER persisted. It lives only in the Zustand store.
 *      - Page refresh = key gone = session expired (zero-knowledge).
 *      - The key can be used to encrypt/decrypt OPFS data in future phases.
 *
 * Crypto primitives used:
 *   - crypto.getRandomValues() — CSPRNG for salt
 *   - crypto.subtle.importKey() — import password as raw key material
 *   - crypto.subtle.deriveKey() — PBKDF2 key derivation
 *   - crypto.subtle.exportKey() — export derived key to ArrayBuffer
 *   - crypto.subtle.digest() — SHA-256 hash for verifier
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface UserRecord {
  userId: string;
  /** Base64-encoded 16-byte salt */
  salt: string;
  /** Base64-encoded SHA-256 hash of the derived master key */
  verifierHash: string;
  /** ISO timestamp of account creation */
  createdAt: string;
}

export interface AuthResult {
  userId: string;
  /** Raw master key bytes — hold in volatile memory ONLY */
  masterKey: ArrayBuffer;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = "southstack-auth";
const DB_VERSION = 1;
const STORE_NAME = "users";
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

// ── IndexedDB helpers ───────────────────────────────────────────────────────

/** Open (or create) the "southstack-auth" IndexedDB database. Auto-creates the "users" object store on first run. */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Insert or update a UserRecord in the "users" object store. */
async function putUser(record: UserRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Retrieve a single UserRecord by userId. Returns undefined if not found. */
async function getUser(userId: string): Promise<UserRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(userId);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as UserRecord | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Retrieve all UserRecords from IndexedDB. Used for the login screen user list. */
async function getAllUsers(): Promise<UserRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as UserRecord[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Delete a UserRecord by userId. Does NOT wipe OPFS data — caller must handle that. */
async function deleteUser(userId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(userId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ── Encoding helpers ────────────────────────────────────────────────────────

/** Convert an ArrayBuffer to a Base64 string for safe IndexedDB storage. */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a Base64 string back into an ArrayBuffer. Inverse of bufferToBase64. */
function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Cryptographic core ──────────────────────────────────────────────────────

/**
 * Derive a 256-bit master key from password + salt using PBKDF2.
 * Returns the raw key as an ArrayBuffer.
 */
async function deriveMasterKey(
  password: string,
  salt: ArrayBuffer
): Promise<ArrayBuffer> {
  // Import the password as raw key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false, // not extractable
    ["deriveKey"]
  );

  // Derive the actual key using PBKDF2
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    true, // extractable — we need the raw bytes for hashing
    ["encrypt", "decrypt"]
  );

  // Export to raw ArrayBuffer
  return crypto.subtle.exportKey("raw", derivedKey);
}

/**
 * Compute SHA-256 hash of an ArrayBuffer.
 */
async function sha256(data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", data);
}

/**
 * Constant-time comparison of two ArrayBuffers to prevent timing attacks.
 */
function constantTimeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  if (viewA.length !== viewB.length) return false;

  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

// ── AuthManager (Singleton) ─────────────────────────────────────────────────

export class AuthManager {
  private static instance: AuthManager | null = null;

  /** Get or create the singleton AuthManager instance. */
  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  private constructor() {}

  /**
   * Register a new user.
   *
   * 1. Generate random salt
   * 2. Derive master key via PBKDF2(password, salt, 100k iterations)
   * 3. Hash the master key → verifier hash
   * 4. Store { userId, salt, verifierHash } in IndexedDB
   * 5. Return the raw master key (caller must hold in volatile memory)
   *
   * @throws If userId already exists
   */
  async register(userId: string, password: string): Promise<AuthResult> {
    // Validate inputs
    if (!userId || userId.length < 1) {
      throw new Error("User ID cannot be empty");
    }
    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Check for existing user
    const existing = await getUser(userId);
    if (existing) {
      throw new Error(`User "${userId}" already exists`);
    }

    // Generate cryptographic salt
    const saltBytes = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(saltBytes);
    const salt = saltBytes.buffer;

    // Derive master key
    const masterKey = await deriveMasterKey(password, salt);

    // Hash master key → verifier
    const verifierHash = await sha256(masterKey);

    // Persist metadata (NEVER the key itself)
    const record: UserRecord = {
      userId,
      salt: bufferToBase64(salt),
      verifierHash: bufferToBase64(verifierHash),
      createdAt: new Date().toISOString(),
    };
    await putUser(record);

    return { userId, masterKey };
  }

  /**
   * Authenticate an existing user.
   *
   * 1. Retrieve salt & verifier hash from IndexedDB
   * 2. Re-derive master key from password + salt
   * 3. Hash derived key → compare with stored verifier
   * 4. Constant-time comparison to prevent timing attacks
   *
   * @throws If credentials are invalid
   */
  async login(userId: string, password: string): Promise<AuthResult> {
    const record = await getUser(userId);
    if (!record) {
      // Generic error to prevent user enumeration
      throw new Error("Invalid credentials");
    }

    // Reconstruct salt
    const salt = base64ToBuffer(record.salt);

    // Re-derive master key
    const masterKey = await deriveMasterKey(password, salt);

    // Hash and compare (constant-time)
    const derivedHash = await sha256(masterKey);
    const storedHash = base64ToBuffer(record.verifierHash);

    if (!constantTimeEqual(derivedHash, storedHash)) {
      throw new Error("Invalid credentials");
    }

    return { userId, masterKey };
  }

  /**
   * List all registered user IDs (for the login screen dropdown).
   * Does NOT expose any sensitive data.
   */
  async listUsers(): Promise<string[]> {
    const records = await getAllUsers();
    return records.map((r) => r.userId);
  }

  /**
   * Delete a user account and all associated metadata.
   * Caller should also wipe the user's OPFS partition.
   */
  async deleteAccount(userId: string): Promise<void> {
    await deleteUser(userId);
  }

  /**
   * Check if any users exist (for first-time setup flow).
   */
  async hasUsers(): Promise<boolean> {
    const users = await getAllUsers();
    return users.length > 0;
  }
}

/**
 * IndexedDB persistence layer for offline-first auth.
 *
 * Uses the raw IndexedDB API — zero external dependencies.
 * Stores: { username (PK), salt, hash }
 *
 * Hardened:
 * - All transactions wrapped in try/catch with QuotaExceededError handling
 * - Final truncation of data immediately before `.add()` / `.put()`
 */

import { AUTH_LIMITS } from "./validation";

export interface UserRecord {
  username: string;
  salt: string;
  hash: string;
}

const DB_NAME = "southstack-auth";
const DB_VERSION = 1;
const STORE_NAME = "users";

// ─── Database Initialization ────────────────────────────────

/**
 * Open (or create) the auth database.
 * Automatically creates the `users` object store on first run.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "username" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Truncate a UserRecord's fields to safe lengths right before storage.
 * Defense-in-depth: prevents oversized data from ever reaching the DB.
 */
function sanitizeRecord(record: UserRecord): UserRecord {
  return {
    username: record.username.slice(0, AUTH_LIMITS.USERNAME_MAX),
    salt: record.salt.slice(0, 128),      // hex-encoded 256-bit = 64 chars, generous cap
    hash: record.hash.slice(0, 128),      // same
  };
}

// ─── CRUD Operations ────────────────────────────────────────

/**
 * Store a new user record in IndexedDB.
 *
 * @throws AuthError("USERNAME_TAKEN") if user exists.
 * @throws AuthError("DB_ERROR") on QuotaExceededError or other DB failures.
 */
export async function createUser(record: UserRecord): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();

    // Check for existing user first
    const existing = await getUser(record.username);
    if (existing) {
      throw new AuthError("USERNAME_TAKEN", "This username is already taken. Please choose another.");
    }

    // Final truncation before write
    const safe = sanitizeRecord(record);

    return await new Promise((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(safe);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db!.close();
    });
  } catch (err: unknown) {
    db?.close();
    // Re-throw AuthError as-is
    if (err instanceof AuthError) throw err;
    // Handle QuotaExceededError
    const e = err as { name?: string; message?: string };
    if (e.name === "QuotaExceededError") {
      throw new AuthError(
        "DB_ERROR",
        "Storage quota exceeded. Please clear some data and try again."
      );
    }
    throw new AuthError("DB_ERROR", e.message ?? "Failed to create user.");
  }
}

/**
 * Retrieve a user record by username.
 *
 * @returns The UserRecord, or `null` if not found.
 */
export async function getUser(username: string): Promise<UserRecord | null> {
  let db: IDBDatabase | null = null;
  try {
    // Hardcoded guard: reject oversized lookups
    if (typeof username !== "string" || username.length > AUTH_LIMITS.USERNAME_MAX) {
      return null;
    }

    db = await openDB();

    return await new Promise((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(username);

      request.onsuccess = () => resolve((request.result as UserRecord) ?? null);
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db!.close();
    });
  } catch (err: unknown) {
    db?.close();
    const e = err as { message?: string };
    throw new AuthError("DB_ERROR", e.message ?? "Failed to read user.");
  }
}

/**
 * Delete a user record (useful for account removal / testing).
 */
export async function deleteUser(username: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();

    return await new Promise((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(username);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db!.close();
    });
  } catch (err: unknown) {
    db?.close();
    const e = err as { name?: string; message?: string };
    if (e.name === "QuotaExceededError") {
      throw new AuthError("DB_ERROR", "Storage quota exceeded.");
    }
    throw new AuthError("DB_ERROR", e.message ?? "Failed to delete user.");
  }
}

// ─── Error Types ────────────────────────────────────────────

export type AuthErrorCode =
  | "USERNAME_TAKEN"
  | "USER_NOT_FOUND"
  | "INCORRECT_PASSWORD"
  | "SESSION_EXPIRED"
  | "DB_ERROR";

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

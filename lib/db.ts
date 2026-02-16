/**
 * IndexedDB persistence layer for offline-first auth.
 *
 * Uses the raw IndexedDB API — zero external dependencies.
 * Stores: { username (PK), salt, hash }
 */

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

// ─── CRUD Operations ────────────────────────────────────────

/**
 * Store a new user record in IndexedDB.
 *
 * @throws If a user with the same username already exists.
 */
export async function createUser(record: UserRecord): Promise<void> {
  const db = await openDB();

  // Check for existing user first
  const existing = await getUser(record.username);
  if (existing) {
    throw new AuthError("USERNAME_TAKEN", `Username "${record.username}" is already registered.`);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieve a user record by username.
 *
 * @returns The UserRecord, or `null` if not found.
 */
export async function getUser(username: string): Promise<UserRecord | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(username);

    request.onsuccess = () => resolve((request.result as UserRecord) ?? null);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a user record (useful for account removal / testing).
 */
export async function deleteUser(username: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(username);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
  });
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

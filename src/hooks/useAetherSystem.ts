/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PHASE 1 — useAetherSystem Hook  (src/hooks/useAetherSystem.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The "orchestrator" hook that wires Auth → FS → ResourceController together.
 *
 * Lifecycle:
 *   1. On mount: check if any users exist → show register or login screen
 *   2. register()/login() → derive master key → store in volatile Zustand
 *   3. After auth → init OPFS filesystem scoped to user
 *   4. After FS → register FS as a tracked service
 *   5. logout() → dispose FS, clear session, optionally panic heavy services
 *
 * This hook is the ONLY place that coordinates these three subsystems.
 * Components never call AuthManager or FileSystemManager directly.
 *
 * Memory budget (4GB target):
 *   - Auth + FS init: ~2MB overhead (negligible)
 *   - Heavy services (AI, WebContainer) are NOT started here — they're
 *     lazy-loaded only when the user explicitly requests them.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef } from "react";
import { AuthManager } from "../auth/AuthManager";
import { FileSystemManager } from "../fs/FileSystemManager";
import { SystemResourceController } from "../system/ResourceController";
import {
  useUserStore,
  selectIsAuthenticated,
  selectSessionStatus,
} from "../store/userStore";

// ── Module-level singletons (survive React strict-mode remounts) ────────────

const authManager = AuthManager.getInstance();
const resourceController = SystemResourceController.getInstance();

// FileSystemManager is per-user, created fresh on each login
let fsManager: FileSystemManager | null = null;

// ── Return type ─────────────────────────────────────────────────────────────

export interface AetherSystem {
  // ── Auth state ────────────────────────────────────────────
  isAuthenticated: boolean;
  status: ReturnType<typeof selectSessionStatus>;
  userId: string | null;
  error: string | null;
  knownUsers: string[];

  // ── Auth actions ──────────────────────────────────────────
  register: (userId: string, password: string) => Promise<void>;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (userId: string) => Promise<void>;

  // ── FS access ─────────────────────────────────────────────
  fs: FileSystemManager | null;

  // ── System ────────────────────────────────────────────────
  resources: SystemResourceController;
  panic: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Orchestrator hook: wires Auth → OPFS → ResourceController into a single API.
 * This is the ONLY place that coordinates auth, filesystem, and resource management.
 * Components never call AuthManager or FileSystemManager directly.
 */
export function useAetherSystem(): AetherSystem {
  const store = useUserStore();
  const isAuthenticated = useUserStore(selectIsAuthenticated);
  const status = useUserStore(selectSessionStatus);
  const initCalled = useRef(false);

  // ── Load known users on mount ──────────────────────────────────────────
  useEffect(() => {
    if (initCalled.current) return;
    initCalled.current = true;

    authManager.listUsers().then((users) => {
      store.setKnownUsers(users);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Register ─────────────────────────────────────────────────────────
  /** Create a new account: derive key → init OPFS → register resource → set session. */
  const register = useCallback(
    async (userId: string, password: string) => {
      store.setStatus("authenticating");

      try {
        const result = await authManager.register(userId, password);

        // Initialize OPFS scoped to this user
        store.setStatus("initializing");
        fsManager = new FileSystemManager();
        await fsManager.init(result.userId);

        // Register FS as a tracked resource
        resourceController.register({
          id: `opfs-${result.userId}`,
          label: `OPFS (${result.userId})`,
          priority: "high",
          estimatedMemoryMB: 5,
          dispose: () => {
            fsManager?.dispose();
            fsManager = null;
          },
        });

        // Set session (master key in volatile memory)
        store.setSession({
          userId: result.userId,
          masterKey: result.masterKey,
          loginAt: Date.now(),
        });

        // Refresh known users list
        const users = await authManager.listUsers();
        store.setKnownUsers(users);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        store.setStatus("error", msg);
        throw err;
      }
    },
    [store]
  );

  // ── Login ────────────────────────────────────────────────────────────
  /** Authenticate existing user: verify credentials → init OPFS → set session. */
  const login = useCallback(
    async (userId: string, password: string) => {
      store.setStatus("authenticating");

      try {
        const result = await authManager.login(userId, password);

        // Initialize OPFS scoped to this user
        store.setStatus("initializing");
        fsManager = new FileSystemManager();
        await fsManager.init(result.userId);

        // Register FS as a tracked resource
        resourceController.register({
          id: `opfs-${result.userId}`,
          label: `OPFS (${result.userId})`,
          priority: "high",
          estimatedMemoryMB: 5,
          dispose: () => {
            fsManager?.dispose();
            fsManager = null;
          },
        });

        // Set session
        store.setSession({
          userId: result.userId,
          masterKey: result.masterKey,
          loginAt: Date.now(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        store.setStatus("error", msg);
        throw err;
      }
    },
    [store]
  );

  // ── Logout ───────────────────────────────────────────────────────────
  /** Dispose FS handle, unregister resource, and clear volatile session (key vanishes). */
  const logout = useCallback(async () => {
    const currentUserId = store.session?.userId;

    // Dispose the user's FS handle
    if (fsManager) {
      fsManager.dispose();
      fsManager = null;
    }

    // Unregister FS resource
    if (currentUserId) {
      resourceController.unregister(`opfs-${currentUserId}`);
    }

    // Clear volatile session (master key vanishes)
    store.clearSession();
  }, [store]);

  // ── Delete account ─────────────────────────────────────────────────────
  /** Permanently delete a user: wipe OPFS partition + remove IndexedDB auth record. */
  const deleteAccount = useCallback(
    async (userId: string) => {
      // If deleting current user, logout first
      if (store.session?.userId === userId) {
        // Wipe OPFS data for this user
        if (fsManager) {
          await fsManager.wipeUserData();
          fsManager = null;
        }
        store.clearSession();
      } else {
        // Wipe another user's data
        const tempFs = new FileSystemManager();
        await tempFs.init(userId);
        await tempFs.wipeUserData();
      }

      // Remove auth record from IndexedDB
      await authManager.deleteAccount(userId);

      // Refresh known users
      const users = await authManager.listUsers();
      store.setKnownUsers(users);
    },
    [store]
  );

  // ── Panic ────────────────────────────────────────────────────────────
  /** Emergency: force-dispose ALL services, wipe FS handle, and clear session immediately. */
  const panic = useCallback(() => {
    resourceController.panic();
    fsManager?.dispose();
    fsManager = null;
    store.clearSession();
  }, [store]);

  // ── Return ─────────────────────────────────────────────────────────────
  return {
    isAuthenticated,
    status,
    userId: store.session?.userId ?? null,
    error: store.error,
    knownUsers: store.knownUsers,

    register,
    login,
    logout,
    deleteAccount,

    fs: fsManager,
    resources: resourceController,
    panic,
  };
}

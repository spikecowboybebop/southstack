/**
 * WebContainer Sync Manager — smart bi-directional sync between
 * the WebContainer filesystem and OPFS.
 *
 * Responsibilities:
 *   1. Watch WebContainer FS for changes (via polling — WebContainer
 *      doesn't expose a native watcher API).
 *   2. Exclude heavyweight paths like `node_modules/` and `.git/`
 *      from sync-back to OPFS.
 *   3. Sync important generated files (`package-lock.json`, etc.)
 *      from the container back to OPFS so they survive reloads.
 *   4. Use the OPFSWriteQueue for safe serialized writes.
 *
 * Usage:
 *   const mgr = new WCSyncManager(wc, writeQueue, { ... });
 *   mgr.start();              // begin polling
 *   await mgr.stop();         // stop + flush
 */

import type { WebContainer } from "@webcontainer/api";
import { OPFSWriteQueue } from "./opfs-write-queue";

// ─── Configuration ──────────────────────────────────────────

export interface SyncManagerConfig {
  /** SHA-256 hex of username (OPFS sandbox key). */
  userHash: string;
  /** Project UUID. */
  projectId: string;
  /** AES-GCM encryption key for OPFS writes. */
  encryptionKey?: CryptoKey;
  /** Polling interval in ms (default: 2000). */
  pollInterval?: number;
  /** OPFS writeFile function — injected to avoid circular deps. */
  writeFileToOPFS: (
    userHash: string,
    projectId: string,
    filePath: string,
    content: string,
    encryptionKey?: CryptoKey
  ) => Promise<void>;
  /** Optional callback when a file is synced back to OPFS. */
  onSyncBack?: (path: string) => void;
}

// Paths that should NEVER be synced back to OPFS
const EXCLUDED_PREFIXES = [
  "node_modules/",
  "node_modules",
  ".git/",
  ".git",
  ".cache/",
  ".cache",
  ".next/",
  ".next",
  "dist/",
  "dist",
  "build/",
  "build",
  ".turbo/",
  ".turbo",
];

// Files that SHOULD be synced back to OPFS when changed in container
// (e.g. after `npm install` generates/updates them)
const SYNC_BACK_FILES = [
  "package-lock.json",
  "package.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "tsconfig.json",
];

// ─── Types ──────────────────────────────────────────────────

interface FileSnapshot {
  /** File content at last poll. */
  content: string;
  /** Timestamp of last modification we observed. */
  mtime: number;
}

// ─── Manager ────────────────────────────────────────────────

export class WCSyncManager {
  private wc: WebContainer;
  private queue: OPFSWriteQueue;
  private config: SyncManagerConfig;
  private pollInterval: number;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private snapshots = new Map<string, FileSnapshot>();
  private polling = false;

  constructor(
    wc: WebContainer,
    queue: OPFSWriteQueue,
    config: SyncManagerConfig
  ) {
    this.wc = wc;
    this.queue = queue;
    this.config = config;
    this.pollInterval = config.pollInterval ?? 2000;
  }

  /** Start the polling loop. */
  start(): void {
    if (this.timerId) return;
    // Do an initial snapshot (don't sync-back on first run)
    this.takeSnapshot(true).catch((err) =>
      console.warn("[SyncManager] Initial snapshot failed:", err)
    );
    this.timerId = setInterval(() => {
      if (!this.polling) {
        this.polling = true;
        this.takeSnapshot(false)
          .catch((err) =>
            console.warn("[SyncManager] Poll failed:", err)
          )
          .finally(() => {
            this.polling = false;
          });
      }
    }, this.pollInterval);
  }

  /** Stop polling and flush any pending writes. */
  async stop(): Promise<void> {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    await this.queue.flush();
  }

  /** Clear internal snapshots (e.g. before a fresh mount). */
  reset(): void {
    this.snapshots.clear();
  }

  // ── Internal ──────────────────────────────────────────────

  /**
   * Walk the sync-back file list in the container, compare to
   * cached snapshots, and enqueue OPFS writes for changed files.
   */
  private async takeSnapshot(isInitial: boolean): Promise<void> {
    for (const filePath of SYNC_BACK_FILES) {
      try {
        const raw = await this.wc.fs.readFile(`/${filePath}`, "utf-8");
        const content =
          typeof raw === "string" ? raw : new TextDecoder().decode(raw);

        const prev = this.snapshots.get(filePath);
        const now = Date.now();

        if (isInitial) {
          // Just record the baseline — don't write back
          this.snapshots.set(filePath, { content, mtime: now });
          continue;
        }

        if (!prev || prev.content !== content) {
          // Content changed — enqueue OPFS write
          this.snapshots.set(filePath, { content, mtime: now });

          const { userHash, projectId, encryptionKey, writeFileToOPFS, onSyncBack } =
            this.config;

          this.queue.enqueue({
            key: filePath,
            execute: async () => {
              await writeFileToOPFS(
                userHash,
                projectId,
                filePath,
                content,
                encryptionKey
              );
              onSyncBack?.(filePath);
            },
          });
        }
      } catch {
        // File doesn't exist in container — that's fine (e.g. no lock file yet)
      }
    }
  }

  /**
   * Check whether a given relative path should be excluded from
   * OPFS sync-back.
   */
  static isExcluded(relativePath: string): boolean {
    for (const prefix of EXCLUDED_PREFIXES) {
      if (relativePath === prefix || relativePath.startsWith(prefix.endsWith("/") ? prefix : prefix + "/")) {
        return true;
      }
    }
    return false;
  }
}

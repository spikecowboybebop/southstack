/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PHASE 1 — FileSystemManager  (src/fs/FileSystemManager.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * OPFS (Origin Private File System) wrapper with strict multi-tenant isolation.
 *
 * Directory structure:
 *   /southstack/users/{userId}/
 *     ├── projects/
 *     │   ├── my-app/
 *     │   │   ├── index.js
 *     │   │   └── package.json
 *     │   └── another-project/
 *     └── settings.json
 *
 * Security model:
 *   - Upon login, this manager resolves a FileSystemDirectoryHandle scoped
 *     STRICTLY to the authenticated user's subdirectory.
 *   - Every path operation validates against the root boundary.
 *   - Any attempt to traverse above the user root (../../) throws immediately.
 *   - The resolved handle is held in memory and released on logout.
 *
 * Why OPFS instead of IndexedDB for files?
 *   - OPFS is optimized for file I/O — faster reads/writes for large files
 *   - Supports streaming and synchronous access workers
 *   - Natural directory hierarchy (vs flat key-value in IDB)
 *   - Better quota management for large codebases
 *
 * Memory considerations (4GB target):
 *   - File contents are read on-demand, never cached in bulk
 *   - Directory listings are lightweight (names + types only)
 *   - No file watchers polling — changes are event-driven
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface FSEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
}

export interface FSFileEntry extends FSEntry {
  kind: "file";
  size?: number;
  lastModified?: number;
}

export interface FSDirectoryEntry extends FSEntry {
  kind: "directory";
  children?: FSEntry[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT_DIR = "southstack";
const USERS_DIR = "users";

// ── Path security ───────────────────────────────────────────────────────────

/**
 * Normalize a path and validate it doesn't escape the sandbox.
 * Rejects: "..", absolute paths, null bytes.
 */
function sanitizePath(relativePath: string): string[] {
  if (relativePath.includes("\0")) {
    throw new SecurityError("Path contains null bytes");
  }

  // Normalize separators and split
  const segments = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s.length > 0 && s !== ".");

  // Check for directory traversal
  for (const seg of segments) {
    if (seg === "..") {
      throw new SecurityError(
        "Directory traversal detected — access denied"
      );
    }
    // Reject hidden system files on Windows
    if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(seg)) {
      throw new SecurityError(`Reserved filename: ${seg}`);
    }
  }

  return segments;
}

// ── Custom error ────────────────────────────────────────────────────────────

export class SecurityError extends Error {
  constructor(message: string) {
    super(`[SouthStack Security] ${message}`);
    this.name = "SecurityError";
  }
}

export class FSNotInitializedError extends Error {
  constructor() {
    super("[SouthStack FS] FileSystem not initialized. Call init() first.");
    this.name = "FSNotInitializedError";
  }
}

// ── FileSystemManager ───────────────────────────────────────────────────────

export class FileSystemManager {
  private userRoot: FileSystemDirectoryHandle | null = null;
  private userId: string | null = null;
  private initialized = false;

  /**
   * Initialize the filesystem for a specific authenticated user.
   * Creates the directory hierarchy if it doesn't exist:
   *   /southstack/users/{userId}/projects/
   *
   * @param userId — The authenticated user's ID
   * @throws SecurityError if userId is invalid
   */
  async init(userId: string): Promise<void> {
    if (!userId || userId.includes("/") || userId.includes("\\")) {
      throw new SecurityError("Invalid userId");
    }

    // Get the OPFS root
    const opfsRoot = await navigator.storage.getDirectory();

    // Create /southstack/
    const appRoot = await opfsRoot.getDirectoryHandle(ROOT_DIR, {
      create: true,
    });

    // Create /southstack/users/
    const usersDir = await appRoot.getDirectoryHandle(USERS_DIR, {
      create: true,
    });

    // Create /southstack/users/{userId}/
    this.userRoot = await usersDir.getDirectoryHandle(userId, {
      create: true,
    });

    // Create default /projects/ subdirectory
    await this.userRoot.getDirectoryHandle("projects", { create: true });

    this.userId = userId;
    this.initialized = true;
  }

  /**
   * Release the directory handle and clear state.
   * Call this on logout to ensure no stale references.
   */
  dispose(): void {
    this.userRoot = null;
    this.userId = null;
    this.initialized = false;
  }

  /**
   * Get the current user ID this FS is scoped to.
   */
  getUserId(): string | null {
    return this.userId;
  }

  /**
   * Check if the FS is initialized and ready.
   */
  isReady(): boolean {
    return this.initialized && this.userRoot !== null;
  }

  // ── File operations ─────────────────────────────────────────────────────

  /**
   * Write a file. Creates parent directories if needed.
   *
   * @param relativePath — Path relative to user root, e.g. "projects/my-app/index.js"
   * @param content — File content as string or ArrayBuffer
   */
  async writeFile(
    relativePath: string,
    content: string | ArrayBuffer
  ): Promise<void> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);

    if (segments.length === 0) {
      throw new Error("Cannot write to root directory");
    }

    // Navigate/create parent directories
    let current = dir;
    for (let i = 0; i < segments.length - 1; i++) {
      current = await current.getDirectoryHandle(segments[i], {
        create: true,
      });
    }

    // Create/overwrite the file
    const fileName = segments[segments.length - 1];
    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }

  /**
   * Read a file's content as a string.
   *
   * @param relativePath — Path relative to user root
   * @throws If file doesn't exist
   */
  async readFile(relativePath: string): Promise<string> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);
    const handle = await this.resolveFileHandle(dir, segments);
    const file = await handle.getFile();
    return file.text();
  }

  /**
   * Read a file as an ArrayBuffer (for binary files).
   */
  async readFileBuffer(relativePath: string): Promise<ArrayBuffer> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);
    const handle = await this.resolveFileHandle(dir, segments);
    const file = await handle.getFile();
    return file.arrayBuffer();
  }

  /**
   * Check if a file or directory exists.
   */
  async exists(relativePath: string): Promise<boolean> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);

    try {
      await this.resolveHandle(dir, segments);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file.
   */
  async deleteFile(relativePath: string): Promise<void> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);

    if (segments.length === 0) {
      throw new Error("Cannot delete root");
    }

    // Navigate to the parent directory
    let current = dir;
    for (let i = 0; i < segments.length - 1; i++) {
      current = await current.getDirectoryHandle(segments[i]);
    }

    const name = segments[segments.length - 1];
    await current.removeEntry(name);
  }

  // ── Directory operations ────────────────────────────────────────────────

  /**
   * Create a directory (and all parents).
   */
  async createDirectory(relativePath: string): Promise<void> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);

    let current = dir;
    for (const seg of segments) {
      current = await current.getDirectoryHandle(seg, { create: true });
    }
  }

  /**
   * Delete a directory and all its contents.
   */
  async deleteDirectory(relativePath: string): Promise<void> {
    const dir = this.ensureInit();
    const segments = sanitizePath(relativePath);

    if (segments.length === 0) {
      throw new Error("Cannot delete user root directory");
    }

    // Navigate to parent
    let current = dir;
    for (let i = 0; i < segments.length - 1; i++) {
      current = await current.getDirectoryHandle(segments[i]);
    }

    const name = segments[segments.length - 1];
    await current.removeEntry(name, { recursive: true });
  }

  /**
   * List the contents of a directory.
   *
   * @param relativePath — Path relative to user root (empty string = user root)
   * @returns Array of FSEntry objects (name, kind, path)
   */
  async listDirectory(relativePath: string = ""): Promise<FSEntry[]> {
    const dir = this.ensureInit();
    const segments =
      relativePath === "" ? [] : sanitizePath(relativePath);

    let current = dir;
    for (const seg of segments) {
      current = await current.getDirectoryHandle(seg);
    }

    const entries: FSEntry[] = [];
    const prefix = relativePath ? `${relativePath}/` : "";

    for await (const [name, handle] of current.entries()) {
      entries.push({
        name,
        kind: handle.kind,
        path: `${prefix}${name}`,
      });
    }

    // Sort: directories first, then alphabetically
    return entries.sort((a, b) => {
      if (a.kind === "directory" && b.kind !== "directory") return -1;
      if (a.kind !== "directory" && b.kind === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Recursively list all files and directories.
   * WARNING: Use sparingly on large trees — can be expensive.
   * For 4GB RAM targets: limit depth or paginate.
   *
   * @param relativePath — Starting directory
   * @param maxDepth — Maximum recursion depth (default: 5)
   */
  async listDirectoryRecursive(
    relativePath: string = "",
    maxDepth: number = 5
  ): Promise<FSEntry[]> {
    if (maxDepth <= 0) return [];

    const entries = await this.listDirectory(relativePath);
    const results: FSEntry[] = [];

    for (const entry of entries) {
      results.push(entry);
      if (entry.kind === "directory") {
        const children = await this.listDirectoryRecursive(
          entry.path,
          maxDepth - 1
        );
        results.push(...children);
      }
    }

    return results;
  }

  /**
   * Rename a file or directory.
   * OPFS doesn't have native rename — we copy + delete.
   */
  async rename(oldPath: string, newName: string): Promise<void> {
    const dir = this.ensureInit();
    const segments = sanitizePath(oldPath);
    const newSegments = sanitizePath(newName);

    if (segments.length === 0) {
      throw new Error("Cannot rename root");
    }
    if (newSegments.length !== 1) {
      throw new Error("New name must be a single path segment");
    }

    // Navigate to parent
    let parent = dir;
    for (let i = 0; i < segments.length - 1; i++) {
      parent = await parent.getDirectoryHandle(segments[i]);
    }

    const oldName = segments[segments.length - 1];
    const targetName = newSegments[0];

    // Try as file first, then directory
    try {
      const oldHandle = await parent.getFileHandle(oldName);
      const file = await oldHandle.getFile();
      const content = await file.arrayBuffer();

      const newHandle = await parent.getFileHandle(targetName, {
        create: true,
      });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();

      await parent.removeEntry(oldName);
    } catch {
      // It's a directory — recursive copy + delete
      await this.copyDirectory(parent, oldName, parent, targetName);
      await parent.removeEntry(oldName, { recursive: true });
    }
  }

  // ── Wipe user data ─────────────────────────────────────────────────────

  /**
   * Completely wipe all data for the current user.
   * Use when deleting an account.
   */
  async wipeUserData(): Promise<void> {
    if (!this.userId) {
      throw new FSNotInitializedError();
    }

    const opfsRoot = await navigator.storage.getDirectory();
    const appRoot = await opfsRoot.getDirectoryHandle(ROOT_DIR);
    const usersDir = await appRoot.getDirectoryHandle(USERS_DIR);
    await usersDir.removeEntry(this.userId, { recursive: true });
    this.dispose();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Assert that init() has been called, and return the user-scoped directory handle.
   * @throws FSNotInitializedError if init() was not called
   */
  private ensureInit(): FileSystemDirectoryHandle {
    if (!this.initialized || !this.userRoot) {
      throw new FSNotInitializedError();
    }
    return this.userRoot;
  }

  /**
   * Walk path segments from root and return the final FileSystemFileHandle.
   * @throws If any intermediate directory or the final file doesn't exist
   */
  private async resolveFileHandle(
    root: FileSystemDirectoryHandle,
    segments: string[]
  ): Promise<FileSystemFileHandle> {
    let dir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      dir = await dir.getDirectoryHandle(segments[i]);
    }
    return dir.getFileHandle(segments[segments.length - 1]);
  }

  /**
   * Walk path segments and return either a file or directory handle.
   * Tries file first, falls back to directory for the last segment.
   */
  private async resolveHandle(
    root: FileSystemDirectoryHandle,
    segments: string[]
  ): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
    if (segments.length === 0) return root;

    let dir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      dir = await dir.getDirectoryHandle(segments[i]);
    }

    const lastName = segments[segments.length - 1];
    try {
      return await dir.getFileHandle(lastName);
    } catch {
      return await dir.getDirectoryHandle(lastName);
    }
  }

  /**
   * Recursively copy a directory's contents.
   */
  private async copyDirectory(
    srcParent: FileSystemDirectoryHandle,
    srcName: string,
    dstParent: FileSystemDirectoryHandle,
    dstName: string
  ): Promise<void> {
    const srcDir = await srcParent.getDirectoryHandle(srcName);
    const dstDir = await dstParent.getDirectoryHandle(dstName, {
      create: true,
    });

    for await (const [name, handle] of srcDir.entries()) {
      if (handle.kind === "file") {
        const fileHandle = await srcDir.getFileHandle(name);
        const file = await fileHandle.getFile();
        const content = await file.arrayBuffer();
        const newFileHandle = await dstDir.getFileHandle(name, {
          create: true,
        });
        const writable = await newFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        await this.copyDirectory(srcDir, name, dstDir, name);
      }
    }
  }
}

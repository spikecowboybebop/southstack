/**
 * OPFS (Origin Private File System) handler.
 *
 * Manages a per-project virtual file system using the browser's
 * navigator.storage.getDirectory() API. Files are sandboxed under
 * a SHA-256 hashed user directory — each user's projects are isolated.
 *
 * Directory structure: OPFS root / <userHash> / <projectId> / …files
 *
 * All file content is encrypted with AES-GCM before writing and
 * decrypted after reading, using an in-memory CryptoKey derived
 * from the user's password. The key never touches localStorage.
 *
 * All operations are async.
 */

import { decryptContent, encryptContent } from "./opfs-crypto";

// ─── Types ──────────────────────────────────────────────────

export interface FSNode {
  /** File or directory name (no path separators). */
  name: string;
  /** Full path from project root, e.g. "src/utils/helpers.ts" */
  path: string;
  /** Whether this is a directory. */
  isDirectory: boolean;
  /** Child nodes (only populated for directories). */
  children: FSNode[];
}

// ─── Root Access ────────────────────────────────────────────

/** Regex: valid SHA-256 hex hash (64 lowercase hex chars). */
const VALID_HASH = /^[0-9a-f]{64}$/;

/**
 * The "jail" function — returns ONLY the user-scoped subdirectory.
 *
 * Instead of handing out the global OPFS root, this function:
 *   1. Gets the OPFS root via navigator.storage.getDirectory()
 *   2. Gets or creates a subdirectory named after the userHash
 *   3. Returns ONLY that subdirectory handle
 *
 * All downstream operations therefore cannot escape the user's sandbox.
 *
 * @throws Error if userHash is invalid (not a 64-char hex string)
 */
export async function getUserDirectoryHandle(
  userHash: string
): Promise<FileSystemDirectoryHandle> {
  if (!VALID_HASH.test(userHash)) {
    throw new Error("Invalid userHash — expected 64-char hex SHA-256.");
  }
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(userHash, { create: true });
}

/**
 * Get the OPFS root for a specific project, scoped to a user's
 * hashed directory: OPFS / <userHash> / <projectId>.
 * Creates directories if they don't exist.
 */
async function getProjectRoot(
  userHash: string,
  projectId: string
): Promise<FileSystemDirectoryHandle> {
  const userDir = await getUserDirectoryHandle(userHash);
  return userDir.getDirectoryHandle(projectId, { create: true });
}

/**
 * Resolve a path like "src/utils/helpers.ts" into its parent
 * directory handle + the final segment name.
 */
async function resolvePath(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const segments = filePath.split("/").filter(Boolean);
  const name = segments.pop()!;
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: false });
  }
  return { parent: current, name };
}

/**
 * Ensure all intermediate directories exist for a given path.
 */
async function ensureParentDirs(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<FileSystemDirectoryHandle> {
  const segments = filePath.split("/").filter(Boolean);
  segments.pop(); // remove the file/folder name itself
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

// ─── Read Operations ────────────────────────────────────────

/**
 * Read the full directory tree for a project.
 */
export async function listTree(userHash: string, projectId: string): Promise<FSNode[]> {
  const root = await getProjectRoot(userHash, projectId);
  return readDir(root, "");
}

async function readDir(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string
): Promise<FSNode[]> {
  const entries: FSNode[] = [];

  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    const path = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === "directory") {
      const children = await readDir(
        handle as FileSystemDirectoryHandle,
        path
      );
      entries.push({ name, path, isDirectory: true, children });
    } else {
      entries.push({ name, path, isDirectory: false, children: [] });
    }
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/**
 * Read the text content of a file.
 * If an encryptionKey is provided, the raw content is decrypted.
 */
export async function readFile(
  userHash: string,
  projectId: string,
  filePath: string,
  encryptionKey?: CryptoKey
): Promise<string> {
  const root = await getProjectRoot(userHash, projectId);
  const { parent, name } = await resolvePath(root, filePath);
  const fileHandle = await parent.getFileHandle(name);
  const file = await fileHandle.getFile();
  const raw = await file.text();

  if (encryptionKey) {
    return decryptContent(raw, encryptionKey);
  }
  return raw;
}

// ─── Write Operations ───────────────────────────────────────

/**
 * Write (create or overwrite) a text file.
 * Automatically creates intermediate directories.
 * If an encryptionKey is provided, content is encrypted before writing.
 */
export async function writeFile(
  userHash: string,
  projectId: string,
  filePath: string,
  content: string,
  encryptionKey?: CryptoKey
): Promise<void> {
  const root = await getProjectRoot(userHash, projectId);
  const parentDir = await ensureParentDirs(root, filePath);
  const segments = filePath.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1];
  const fileHandle = await parentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const data = encryptionKey ? await encryptContent(content, encryptionKey) : content;
  await writable.write(data);
  await writable.close();
}

/**
 * Create a new empty file. Throws if the file already exists.
 * If an encryptionKey is provided, the initial content is encrypted.
 */
export async function createFile(
  userHash: string,
  projectId: string,
  filePath: string,
  initialContent: string = "",
  encryptionKey?: CryptoKey
): Promise<void> {
  const root = await getProjectRoot(userHash, projectId);
  const parentDir = await ensureParentDirs(root, filePath);
  const segments = filePath.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1];

  // Check if it already exists
  try {
    await parentDir.getFileHandle(fileName);
    throw new Error(`File "${filePath}" already exists.`);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e.name !== "NotFoundError") {
      throw err;
    }
  }

  const fileHandle = await parentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const data = encryptionKey
    ? await encryptContent(initialContent, encryptionKey)
    : initialContent;
  await writable.write(data);
  await writable.close();
}

/**
 * Create a new directory. Creates intermediate directories as needed.
 */
export async function createDirectory(
  userHash: string,
  projectId: string,
  dirPath: string
): Promise<void> {
  const root = await getProjectRoot(userHash, projectId);
  const segments = dirPath.split("/").filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
}

// ─── Delete Operations ──────────────────────────────────────

/**
 * Delete a file or directory (recursive).
 */
export async function deleteEntry(
  userHash: string,
  projectId: string,
  entryPath: string
): Promise<void> {
  const root = await getProjectRoot(userHash, projectId);
  const segments = entryPath.split("/").filter(Boolean);
  const name = segments.pop()!;

  let parent = root;
  for (const segment of segments) {
    parent = await parent.getDirectoryHandle(segment);
  }

  await parent.removeEntry(name, { recursive: true });
}

/**
 * Delete an entire project's OPFS directory (all files).
 * Called when a project is deleted from IndexedDB to clean up storage.
 */
export async function deleteProjectOPFS(
  userHash: string,
  projectId: string
): Promise<void> {
  const userDir = await getUserDirectoryHandle(userHash);
  try {
    await userDir.removeEntry(projectId, { recursive: true });
  } catch {
    // Directory may not exist — that's fine
  }
}

/**
 * Security check: list ONLY the project directories that exist
 * inside the authenticated user's hashed directory.
 *
 * Any folder or file outside the user's sandbox is silently ignored.
 * Returns an array of project IDs (directory names) found.
 */
export async function listUserProjectIds(
  userHash: string
): Promise<string[]> {
  const userDir = await getUserDirectoryHandle(userHash);
  const ids: string[] = [];

  for await (const [name, handle] of userDir as unknown as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    // Only include directories (each is a project root)
    // Files at the user level are ignored (boundary check)
    if (handle.kind === "directory") {
      ids.push(name);
    }
  }

  return ids;
}

/**
 * Rename a file or directory by copying + deleting.
 * (OPFS doesn't support native rename.)
 * For file renames, the raw bytes are copied directly — no re-encryption needed.
 */
export async function renameEntry(
  userHash: string,
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const root = await getProjectRoot(userHash, projectId);

  // Determine if it's a file or directory
  const segments = oldPath.split("/").filter(Boolean);
  const name = segments[segments.length - 1];
  let parent = root;
  for (let i = 0; i < segments.length - 1; i++) {
    parent = await parent.getDirectoryHandle(segments[i]);
  }

  // Try as file first — copy raw bytes (already encrypted)
  try {
    const fileHandle = await parent.getFileHandle(name);
    const file = await fileHandle.getFile();
    const rawContent = await file.text();

    // Write raw (already encrypted) content to new path
    const newRoot = await getProjectRoot(userHash, projectId);
    const newParentDir = await ensureParentDirs(newRoot, newPath);
    const newSegments = newPath.split("/").filter(Boolean);
    const newFileName = newSegments[newSegments.length - 1];
    const newFileHandle = await newParentDir.getFileHandle(newFileName, { create: true });
    const writable = await newFileHandle.createWritable();
    await writable.write(rawContent);
    await writable.close();

    await deleteEntry(userHash, projectId, oldPath);
    return;
  } catch {
    // Not a file — try as directory
  }

  // For directory rename, we only support renaming leaf directories
  await createDirectory(userHash, projectId, newPath);
  await deleteEntry(userHash, projectId, oldPath);
}

// ─── Language Detection ─────────────────────────────────────

const EXT_LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  json: "json",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  toml: "toml",
  txt: "plaintext",
  env: "plaintext",
  gitignore: "plaintext",
};

/**
 * Detect Monaco language from a file name/path.
 */
export function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";

  // Handle dotfiles
  if (name === ".gitignore" || name === ".env") return "plaintext";
  if (name === "Dockerfile") return "dockerfile";
  if (name === "Makefile") return "makefile";

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG_MAP[ext] ?? "plaintext";
}

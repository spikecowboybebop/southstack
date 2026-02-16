/**
 * OPFS (Origin Private File System) handler.
 *
 * Manages a per-project virtual file system using the browser's
 * navigator.storage.getDirectory() API. Each project gets its own
 * top-level directory keyed by projectId.
 *
 * All operations are async. Files are stored as UTF-8 text.
 */

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

/**
 * Get the OPFS root for a specific project.
 * Creates the project directory if it doesn't exist.
 */
async function getProjectRoot(
  projectId: string
): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(projectId, { create: true });
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
export async function listTree(projectId: string): Promise<FSNode[]> {
  const root = await getProjectRoot(projectId);
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
 */
export async function readFile(
  projectId: string,
  filePath: string
): Promise<string> {
  const root = await getProjectRoot(projectId);
  const { parent, name } = await resolvePath(root, filePath);
  const fileHandle = await parent.getFileHandle(name);
  const file = await fileHandle.getFile();
  return file.text();
}

// ─── Write Operations ───────────────────────────────────────

/**
 * Write (create or overwrite) a text file.
 * Automatically creates intermediate directories.
 */
export async function writeFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  const root = await getProjectRoot(projectId);
  const parentDir = await ensureParentDirs(root, filePath);
  const segments = filePath.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1];
  const fileHandle = await parentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Create a new empty file. Throws if the file already exists.
 */
export async function createFile(
  projectId: string,
  filePath: string,
  initialContent: string = ""
): Promise<void> {
  const root = await getProjectRoot(projectId);
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
  await writable.write(initialContent);
  await writable.close();
}

/**
 * Create a new directory. Creates intermediate directories as needed.
 */
export async function createDirectory(
  projectId: string,
  dirPath: string
): Promise<void> {
  const root = await getProjectRoot(projectId);
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
  projectId: string,
  entryPath: string
): Promise<void> {
  const root = await getProjectRoot(projectId);
  const segments = entryPath.split("/").filter(Boolean);
  const name = segments.pop()!;

  let parent = root;
  for (const segment of segments) {
    parent = await parent.getDirectoryHandle(segment);
  }

  await parent.removeEntry(name, { recursive: true });
}

/**
 * Rename a file or directory by copying + deleting.
 * (OPFS doesn't support native rename.)
 */
export async function renameEntry(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const root = await getProjectRoot(projectId);

  // Determine if it's a file or directory
  const segments = oldPath.split("/").filter(Boolean);
  const name = segments[segments.length - 1];
  let parent = root;
  for (let i = 0; i < segments.length - 1; i++) {
    parent = await parent.getDirectoryHandle(segments[i]);
  }

  // Try as file first
  try {
    const fileHandle = await parent.getFileHandle(name);
    const file = await fileHandle.getFile();
    const content = await file.text();
    await writeFile(projectId, newPath, content);
    await deleteEntry(projectId, oldPath);
    return;
  } catch {
    // Not a file — try as directory (copy not supported for dirs, just rename leaf)
  }

  // For directory rename, we only support renaming leaf directories
  // (a full recursive copy would be needed for nested renames)
  await createDirectory(projectId, newPath);
  await deleteEntry(projectId, oldPath);
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

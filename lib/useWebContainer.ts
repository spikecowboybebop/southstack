/**
 * useWebContainer — React hook for WebContainer lifecycle.
 *
 * Boots a single WebContainer instance (singleton) and exposes
 * the instance + boot status so the terminal component can spawn
 * shells against it.
 *
 * Also provides:
 *   - mountProjectFiles()   — read encrypted OPFS files → mount at container root
 *   - rehydrateProject()    — mount + auto `npm install` piped to terminal
 *   - syncFileToContainer() — mirror an individual editor save in real-time
 *   - syncDirToContainer()  — mirror a directory creation
 *   - syncDeleteInContainer() — mirror a deletion
 *   - teardownProject()     — kill all processes + clean up
 *
 * WebContainer requires the page be served with:
 *   Cross-Origin-Embedder-Policy: require-corp
 *   Cross-Origin-Opener-Policy: same-origin
 * (configured in next.config.ts)
 */

"use client";

import {
    WebContainer,
    type FileSystemTree,
    type WebContainerProcess,
} from "@webcontainer/api";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";

import { listTree, readFile, type FSNode } from "./opfs";

// ─── Singleton ──────────────────────────────────────────────

let _instance: WebContainer | null = null;
let _bootPromise: Promise<WebContainer> | null = null;

/**
 * Boot or return the existing WebContainer.
 * WebContainer.boot() can only be called ONCE per page — this
 * guarantees we never call it twice.
 */
async function getOrBoot(): Promise<WebContainer> {
  if (_instance) return _instance;
  if (_bootPromise) return _bootPromise;

  _bootPromise = WebContainer.boot().then((wc) => {
    _instance = wc;
    return wc;
  });

  return _bootPromise;
}

/**
 * Reset the singleton state. Call this on page load (before boot)
 * when using full-page navigation between projects so the hook
 * starts fresh. The next call to `useWebContainer()` will trigger
 * a brand-new `WebContainer.boot()`.
 *
 * Note: In practice, a full `window.location.assign()` already
 * destroys the JS heap (including the old singleton), but this
 * function exists for explicit safety and testability.
 */
export function resetSingleton(): void {
  _instance = null;
  _bootPromise = null;
}

// ─── Hook ───────────────────────────────────────────────────

export interface WebContainerState {
  /** The booted WebContainer (null while booting). */
  instance: WebContainer | null;
  /** True while the container is booting. */
  isBooting: boolean;
  /** Error if boot failed. */
  error: string | null;
}

/**
 * React hook that boots a WebContainer (no starter FS mounted by default —
 * project files are mounted via mountProjectFiles after boot).
 *
 * @returns { instance, isBooting, error }
 */
export function useWebContainer(): WebContainerState {
  const [instance, setInstance] = useState<WebContainer | null>(_instance);
  const [isBooting, setIsBooting] = useState(!_instance);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Already booted (HMR / fast-refresh)
    if (_instance) {
      setInstance(_instance);
      setIsBooting(false);
      return;
    }

    (async () => {
      try {
        const wc = await getOrBoot();
        if (mounted.current) {
          setInstance(wc);
          setIsBooting(false);
        }
      } catch (err: unknown) {
        if (mounted.current) {
          const msg =
            err instanceof Error ? err.message : "WebContainer boot failed.";
          setError(msg);
          setIsBooting(false);
        }
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

  return { instance, isBooting, error };
}

// ─── Project File Mounting ───────────────────────────────────

/**
 * Recursively convert OPFS FSNodes into a WebContainer FileSystemTree,
 * reading and decrypting each file's content along the way.
 */
async function buildFsTree(
  nodes: FSNode[],
  userHash: string,
  projectId: string,
  encryptionKey?: CryptoKey
): Promise<FileSystemTree> {
  const tree: FileSystemTree = {};

  for (const node of nodes) {
    if (node.isDirectory) {
      tree[node.name] = {
        directory: await buildFsTree(
          node.children,
          userHash,
          projectId,
          encryptionKey
        ),
      };
    } else {
      try {
        const content = await readFile(
          userHash,
          projectId,
          node.path,
          encryptionKey
        );
        tree[node.name] = {
          file: { contents: content },
        };
      } catch (err) {
        console.warn(`[mountProjectFiles] Skipping ${node.path}:`, err);
      }
    }
  }

  return tree;
}

/**
 * Recursively create directories inside the WebContainer FS.
 * WebContainer's `fs.mkdir` doesn't support `{ recursive: true }`
 * natively, so we walk segment-by-segment.
 */
async function mkdirp(instance: WebContainer, dirPath: string): Promise<void> {
  const segments = dirPath.split("/").filter(Boolean);
  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    try {
      await instance.fs.mkdir(current);
    } catch {
      // Directory may already exist — that's fine.
    }
  }
}

/**
 * Read encrypted project files from OPFS, decrypt them, and mount
 * into the WebContainer at the root `/`.
 *
 * The shell starts at `/` by default, so `ls` and `pwd` will show
 * the project files directly — no `/home/` prefix.
 *
 * @param instance      — The booted WebContainer.
 * @param userHash      — SHA-256 hex of the username (OPFS sandbox key).
 * @param projectId     — Project UUID.
 * @param encryptionKey — AES-GCM key for decryption (optional).
 */
export async function mountProjectFiles(
  instance: WebContainer,
  userHash: string,
  projectId: string,
  encryptionKey?: CryptoKey
): Promise<void> {
  const nodes = await listTree(userHash, projectId);

  if (nodes.length === 0) {
    console.info("[mountProjectFiles] No files to mount.");
    return;
  }

  const fsTree = await buildFsTree(nodes, userHash, projectId, encryptionKey);
  await instance.mount(fsTree);

  console.info(
    `[mountProjectFiles] Mounted ${nodes.length} top-level entries at /`
  );
}

// ─── Real-time File Sync ─────────────────────────────────────

/**
 * Mirror a single file write from the editor / OPFS into the
 * WebContainer file system so the terminal sees changes immediately.
 *
 * Call this every time a file is saved in the editor (after the
 * OPFS write succeeds) to keep the two file systems in sync.
 *
 * Files are written at the container root, e.g. "src/index.ts" → "/src/index.ts".
 *
 * @param instance — The booted WebContainer.
 * @param filePath — Relative path inside the project, e.g. "src/index.ts".
 * @param content  — The plaintext file content (already decrypted).
 */
export async function syncFileToContainer(
  instance: WebContainer,
  filePath: string,
  content: string
): Promise<void> {
  const fullPath = `/${filePath}`;

  // Ensure parent directories exist inside the container
  const lastSlash = fullPath.lastIndexOf("/");
  if (lastSlash > 0) {
    await mkdirp(instance, fullPath.substring(0, lastSlash));
  }

  await instance.fs.writeFile(fullPath, content);
}

/**
 * Mirror a directory creation from the editor / sidebar into the
 * WebContainer file system.
 *
 * @param instance — The booted WebContainer.
 * @param dirPath  — Relative directory path, e.g. "src/utils".
 */
export async function syncDirToContainer(
  instance: WebContainer,
  dirPath: string
): Promise<void> {
  await mkdirp(instance, `/${dirPath}`);
}

/**
 * Mirror a file/directory deletion from the editor into the container.
 *
 * @param instance  — The booted WebContainer.
 * @param entryPath — Relative path of the deleted entry.
 */
export async function syncDeleteInContainer(
  instance: WebContainer,
  entryPath: string
): Promise<void> {
  try {
    await instance.fs.rm(`/${entryPath}`, { recursive: true });
  } catch {
    // Entry may not exist in the container — that's fine.
  }
}

// ─── NPM Script / Server Lifecycle ──────────────────────────

export interface PackageScripts {
  [scriptName: string]: string;
}

/**
 * Read and parse `/package.json` from the WebContainer.
 * Returns an empty scripts map when file is missing or invalid.
 */
export async function readPackageScripts(
  instance: WebContainer
): Promise<PackageScripts> {
  try {
    const raw = await instance.fs.readFile("/package.json", "utf-8");
    const pkgText =
      typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const pkg = JSON.parse(pkgText) as { scripts?: unknown };

    if (!pkg.scripts || typeof pkg.scripts !== "object") {
      return {};
    }

    const entries = Object.entries(pkg.scripts as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([name, value]) => [name, value as string]);

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/**
 * Spawn `npm run <scriptName>` as an isolated process.
 * Caller should keep the returned process object to stop it later.
 */
export async function spawnNpmScript(
  instance: WebContainer,
  scriptName: string
): Promise<WebContainerProcess> {
  return instance.spawn("npm", ["run", scriptName]);
}

// ─── Project Rehydration (mount + npm install) ──────────────

export type RehydrationPhase =
  | "mounting"
  | "installing"
  | "ready"
  | "error";

export interface RehydrationCallbacks {
  /** Called when the phase changes. */
  onPhase?: (phase: RehydrationPhase) => void;
  /** Called if npm install exits with a non-zero code. */
  onInstallError?: (exitCode: number) => void;
}

/**
 * Mount project files from OPFS and, if `package.json` exists,
 * automatically run `npm install` — piping all output into the
 * given xterm terminal so the user sees real-time progress.
 *
 * Returns the install process (if one was spawned) so the caller
 * can kill it during cleanup.
 *
 * @param instance      — The booted WebContainer.
 * @param userHash      — SHA-256 hex of the username (OPFS sandbox key).
 * @param projectId     — Project UUID.
 * @param encryptionKey — AES-GCM key for decryption (optional).
 * @param terminal      — xterm Terminal to pipe npm output into.
 * @param callbacks     — Optional lifecycle callbacks.
 */
export async function rehydrateProject(
  instance: WebContainer,
  userHash: string,
  projectId: string,
  encryptionKey: CryptoKey | undefined,
  terminal: XTermTerminal | null,
  callbacks?: RehydrationCallbacks
): Promise<WebContainerProcess | null> {
  const { onPhase, onInstallError } = callbacks ?? {};

  // Phase 1 — Mount OPFS files
  onPhase?.("mounting");
  await mountProjectFiles(instance, userHash, projectId, encryptionKey);

  // Phase 2 — Check if package.json exists
  let hasPackageJson = false;
  try {
    await instance.fs.readFile("/package.json", "utf-8");
    hasPackageJson = true;
  } catch {
    // No package.json — skip install
  }

  if (!hasPackageJson) {
    onPhase?.("ready");
    return null;
  }

  // Phase 3 — Run `npm install`, pipe output to terminal
  onPhase?.("installing");

  if (terminal) {
    terminal.writeln("\r\n\x1b[1;36m▶ Running npm install…\x1b[0m\r\n");
  }

  const installProcess = await instance.spawn("npm", ["install"]);

  // Pipe stdout → terminal
  installProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal?.write(data);
      },
    })
  );

  // Wait for install to finish
  const exitCode = await installProcess.exit;

  if (exitCode !== 0) {
    terminal?.writeln(
      `\r\n\x1b[1;31m✗ npm install exited with code ${exitCode}\x1b[0m\r\n`
    );
    onInstallError?.(exitCode);
    onPhase?.("error");
  } else {
    terminal?.writeln(
      "\r\n\x1b[1;32m✓ npm install complete\x1b[0m\r\n"
    );
    onPhase?.("ready");
  }

  return installProcess;
}

// ─── Teardown ────────────────────────────────────────────────

/** Kill a server process safely (ignoring if already exited). */
export function killProcess(proc: WebContainerProcess | null): void {
  if (!proc) return;
  try {
    proc.kill();
  } catch {
    // Already exited — that's fine.
  }
}

/**
 * Full project teardown — kill server, clean up state.
 *
 * @param serverProcess — The running server process (if any).
 */
export function teardownProject(
  serverProcess: WebContainerProcess | null
): void {
  killProcess(serverProcess);
}

// ─── File System Wipe ────────────────────────────────────────

/**
 * Recursively delete every file and directory at the container root.
 *
 * WebContainer has no "format" command, so we:
 *   1. `readdir("/")` to list top-level entries.
 *   2. `rm(entry, { recursive: true })` each one.
 *
 * This leaves an empty `/` ready for a fresh mount.
 */
export async function wipeContainerFS(
  instance: WebContainer
): Promise<void> {
  let entries: string[];
  try {
    entries = await instance.fs.readdir("/");
  } catch {
    // FS may already be empty or not initialised
    return;
  }

  for (const entry of entries) {
    try {
      await instance.fs.rm(`/${entry}`, { recursive: true });
    } catch {
      // Best-effort — some virtual entries may not be removable
    }
  }

  console.info("[wipeContainerFS] Container filesystem cleared.");
}

// ─── Project Switch ──────────────────────────────────────────

export interface SwitchProjectOptions {
  /** The booted WebContainer (singleton — never changes). */
  instance: WebContainer;
  /** The jsh process to kill before respawning. */
  shellProcess: WebContainerProcess | null;
  /** The running server process (dev/start) to kill. */
  serverProcess: WebContainerProcess | null;
  /** New project's OPFS coordinates. */
  userHash: string;
  projectId: string;
  encryptionKey?: CryptoKey;
  /** xterm terminal for clearing + piping npm install output. */
  terminal: XTermTerminal | null;
  /** Lifecycle callbacks (same as rehydrateProject). */
  callbacks?: RehydrationCallbacks;
}

/**
 * Full project switch sequence — designed to eliminate "ghost files":
 *
 *   1. **Teardown** — kill the active jsh shell and any npm server
 *      processes so nothing holds file handles or writes to the FS.
 *   2. **Wipe FS** — recursively delete every file at `/` using
 *      `readdir` + `rm({ recursive: true })`.
 *   3. **Clear terminal** — `terminal.clear()` to wipe the xterm
 *      scrollback so the user doesn't see stale output.
 *   4. **Mount new project** — mount the new project's OPFS files
 *      into the now-empty container FS.
 *   5. **Auto npm install** — if `package.json` exists, run
 *      `npm install` and pipe output to the terminal.
 *
 * Returns the npm install process (if spawned) so the caller can
 * track or kill it. The caller is responsible for spawning a fresh
 * jsh shell *after* this function resolves (the WebTerminal
 * component handles that via its `resetShell` imperative method).
 */
export async function switchProject(
  opts: SwitchProjectOptions
): Promise<WebContainerProcess | null> {
  const {
    instance,
    shellProcess,
    serverProcess,
    userHash,
    projectId,
    encryptionKey,
    terminal,
    callbacks,
  } = opts;

  // 1. Teardown — kill all active processes
  killProcess(shellProcess);
  killProcess(serverProcess);

  // 2. Wipe the container file system
  await wipeContainerFS(instance);

  // 3. Clear the terminal display
  terminal?.clear();

  // 4 + 5. Mount new project + auto npm install
  return rehydrateProject(
    instance,
    userHash,
    projectId,
    encryptionKey,
    terminal,
    callbacks
  );
}

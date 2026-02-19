/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERABLE 5 — WebContainer Manager  (src/webcontainer/manager.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Boots a full Node.js runtime *inside the browser* via WebContainers.
 *
 * Prerequisites (handled in vite.config.ts):
 *   • Cross-Origin-Opener-Policy:   same-origin
 *   • Cross-Origin-Embedder-Policy: require-corp
 *   These enable SharedArrayBuffer, which WebContainers need.
 *
 * Usage:
 *   const mgr = WebContainerManager.getInstance();
 *   await mgr.boot();
 *   await mgr.writeFile("/index.js", "console.log('hello')");
 *   mgr.onTerminalData((data) => terminal.write(data));
 *   await mgr.runCommand("node", ["index.js"]);
 *
 * Lifecycle:
 *   • `boot()` — call once; idempotent. Boots the WebContainer.
 *   • `writeFile()` / `readFile()` — virtual filesystem operations.
 *   • `runCommand()` — spawn a process (node, npm, etc.).
 *   • `onTerminalData()` — subscribe to stdout/stderr for the xterm UI.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { WebContainer, type WebContainerProcess } from "@webcontainer/api";
import type { FileNode } from "../store/fileExplorerStore";

export type TerminalDataCallback = (data: string) => void;
export type FSChangeCallback = () => void;

export class WebContainerManager {
  // ── Singleton ──────────────────────────────────────────────────────────
  private static instance: WebContainerManager | null = null;

  /** Get or create the singleton WebContainerManager instance. */
  static getInstance(): WebContainerManager {
    if (!WebContainerManager.instance) {
      WebContainerManager.instance = new WebContainerManager();
    }
    return WebContainerManager.instance;
  }

  // ── Internal state ─────────────────────────────────────────────────────
  private container: WebContainer | null = null;
  private booting: Promise<WebContainer> | null = null;
  private terminalListeners: TerminalDataCallback[] = [];
  private fsChangeListeners: FSChangeCallback[] = [];
  private currentProcess: WebContainerProcess | null = null;

  private constructor() {}

  // ── Boot ────────────────────────────────────────────────────────────────
  /**
   * Boot the WebContainer. Safe to call multiple times — only the first
   * call actually boots; subsequent calls return the same instance.
   */
  async boot(): Promise<WebContainer> {
    if (this.container) return this.container;
    if (this.booting) return this.booting;

    this.booting = WebContainer.boot().then((wc) => {
      this.container = wc;
      this.emit("[WebContainer] Booted successfully.\r\n");
      return wc;
    });

    return this.booting;
  }

  // ── Filesystem helpers ─────────────────────────────────────────────────

  /** Write a string to a file in the virtual FS. Creates the file if it doesn't exist. */
  async writeFile(path: string, contents: string): Promise<void> {
    const wc = await this.ensureBooted();
    await wc.fs.writeFile(path, contents);
  }

  /** Read a file from the virtual FS as a UTF-8 string. */
  async readFile(path: string): Promise<string> {
    const wc = await this.ensureBooted();
    return wc.fs.readFile(path, "utf-8");
  }

  /** Create a directory (recursively) in the virtual FS. */
  async mkdir(path: string): Promise<void> {
    const wc = await this.ensureBooted();
    await wc.fs.mkdir(path, { recursive: true });
  }

  // ── Process execution ──────────────────────────────────────────────────

  /**
   * Spawn a command in the WebContainer (e.g. `node index.js`, `npm install`).
   * Stdout and stderr are forwarded to all registered terminal listeners.
   * Returns the exit code.
   */
  async runCommand(
    command: string,
    args: string[] = []
  ): Promise<number> {
    const wc = await this.ensureBooted();

    this.emit(`$ ${command} ${args.join(" ")}\r\n`);

    const process = await wc.spawn(command, args);
    this.currentProcess = process;

    // Pipe stdout → terminal listeners
    process.output.pipeTo(
      new WritableStream({
        write: (data) => {
          this.emit(data);
        },
      })
    );

    const exitCode = await process.exit;
    this.currentProcess = null;
    this.emit(`\r\n[Process exited with code ${exitCode}]\r\n`);
    return exitCode;
  }

  /**
   * Write to the stdin of the currently running process (for interactive CLIs).
   */
  async writeToProcess(data: string): Promise<void> {
    if (this.currentProcess) {
      const writer = this.currentProcess.input.getWriter();
      await writer.write(data);
      writer.releaseLock();
    }
  }

  // ── Seed a starter project ─────────────────────────────────────────────

  /**
   * Writes a minimal Node.js project into the virtual FS so users have
   * something to run immediately.
   */
  async seedProject(): Promise<void> {
    await this.writeFile(
      "package.json",
      JSON.stringify(
        {
          name: "sandbox",
          version: "1.0.0",
          type: "module",
          scripts: { start: "node index.js" },
        },
        null,
        2
      )
    );

    await this.writeFile(
      "index.js",
      [
        "// 🏗️  Welcome to SouthStack!",
        "// This file runs inside a WebContainer — a full Node.js ",
        "// runtime in your browser. Edit this code and press Run.",
        "",
        'console.log("Hello from WebContainer! 🚀");',
        'console.log("Node version:", process.version);',
        "",
        "// Try importing built-in modules:",
        'import { cpus } from "node:os";',
        'console.log("Logical CPUs:", cpus().length);',
        "",
      ].join("\n")
    );
  }

  // ── Terminal subscription ──────────────────────────────────────────────

  /** Subscribe to terminal output. Returns an unsubscribe function. */
  onTerminalData(cb: TerminalDataCallback): () => void {
    this.terminalListeners.push(cb);
    return () => {
      this.terminalListeners = this.terminalListeners.filter((l) => l !== cb);
    };
  }

  // ── URL listener (for dev servers) ─────────────────────────────────────

  /**
   * Listen for WebContainer's `server-ready` event so we can show
   * the preview URL in the future.
   */
  async onServerReady(cb: (port: number, url: string) => void): Promise<void> {
    const wc = await this.ensureBooted();
    wc.on("server-ready", cb);
  }

  // ── Extended Filesystem Operations (for File Explorer) ──────────────────

  /**
   * Recursively read the virtual filesystem and return a FileNode tree.
   * Skips node_modules and .git to keep the tree manageable.
   */
  async readTree(dirPath: string = "/"): Promise<FileNode[]> {
    const wc = await this.ensureBooted();
    const entries = await wc.fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const name = entry.name;
      // Skip heavy/irrelevant directories
      if (name === "node_modules" || name === ".git") continue;

      const fullPath = dirPath === "/" ? `/${name}` : `${dirPath}/${name}`;

      if (entry.isDirectory()) {
        const children = await this.readTree(fullPath);
        nodes.push({
          name,
          type: "directory",
          path: fullPath,
          children,
          expanded: false,
        });
      } else {
        nodes.push({ name, type: "file", path: fullPath });
      }
    }

    // Sort: folders first, then alphabetically
    return nodes.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Delete a file from the virtual filesystem.
   */
  async deleteFile(path: string): Promise<void> {
    const wc = await this.ensureBooted();
    await wc.fs.rm(path);
    this.emitFSChange();
  }

  /**
   * Delete a directory (and all contents) from the virtual filesystem.
   */
  async deleteDir(path: string): Promise<void> {
    const wc = await this.ensureBooted();
    await wc.fs.rm(path, { recursive: true, force: true });
    this.emitFSChange();
  }

  /**
   * Rename or move a file/directory.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const wc = await this.ensureBooted();
    await wc.fs.rename(oldPath, newPath);
    this.emitFSChange();
  }

  /**
   * Create a file (and any necessary parent directories).
   * Notifies FS change listeners.
   */
  async createFile(path: string, contents: string = ""): Promise<void> {
    const wc = await this.ensureBooted();
    // Ensure parent directory exists
    const parentDir = path.substring(0, path.lastIndexOf("/"));
    if (parentDir && parentDir !== "/") {
      await wc.fs.mkdir(parentDir, { recursive: true });
    }
    await wc.fs.writeFile(path, contents);
    this.emitFSChange();
  }

  /**
   * Create a directory (recursively). Notifies FS change listeners.
   */
  async createDir(path: string): Promise<void> {
    const wc = await this.ensureBooted();
    await wc.fs.mkdir(path, { recursive: true });
    this.emitFSChange();
  }

  // ── FS change subscription ─────────────────────────────────────────────

  /** Subscribe to FS change events. Returns an unsubscribe function. */
  onFSChange(cb: FSChangeCallback): () => void {
    this.fsChangeListeners.push(cb);
    return () => {
      this.fsChangeListeners = this.fsChangeListeners.filter((l) => l !== cb);
    };
  }

  /** Notify all FS change listeners (called after create/delete/rename ops). */
  private emitFSChange(): void {
    for (const cb of this.fsChangeListeners) {
      cb();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Ensure WebContainer is booted, booting it lazily if needed. */
  private async ensureBooted(): Promise<WebContainer> {
    if (this.container) return this.container;
    return this.boot();
  }

  /** Broadcast data string to all registered terminal listeners. */
  private emit(data: string): void {
    for (const cb of this.terminalListeners) {
      cb(data);
    }
  }
}

"use client";

/**
 * WebTerminal — xterm.js terminal connected to a WebContainer shell.
 *
 * Spawns `jsh` (the WebContainer shell) and pipes stdin/stdout
 * through an Xterm.js instance. Handles window resizing via the
 * FitAddon so the terminal dimensions stay in sync.
 *
 * Exposes the underlying xterm Terminal via a forwarded ref so
 * parent components can pipe external process output (e.g. npm
 * install) into the same terminal surface.
 *
 * Usage:
 *   const termRef = useRef<WebTerminalHandle>(null);
 *   <WebTerminal ref={termRef} instance={webcontainer} />
 *   // later: termRef.current?.terminal?.writeln("hello");
 */

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  ChevronDown,
  ChevronUp,
  TerminalSquare,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ─── Props & Handle ─────────────────────────────────────────

interface WebTerminalProps {
  /** The booted WebContainer instance. */
  instance: WebContainer;
}

/** Imperative handle exposed via ref. */
export interface WebTerminalHandle {
  /** The underlying xterm Terminal (null before mount). */
  terminal: Terminal | null;
  /** The active jsh process (null before spawn). */
  shellProcess: WebContainerProcess | null;
  /**
   * Kill the current jsh shell, clear the terminal display,
   * and spawn a brand-new jsh session. Call this after
   * `switchProject()` to give the user a clean shell pointing
   * at the freshly-mounted file system.
   */
  resetShell: () => Promise<void>;
  /**
   * Write raw data (e.g. a command + "\r") to the shell's stdin.
   * Use this to programmatically execute commands in the terminal.
   */
  writeToShell: (data: string) => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────

const WebTerminal = forwardRef<WebTerminalHandle, WebTerminalProps>(
  ({ instance }, ref) => {
    const termRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const processRef = useRef<WebContainerProcess | null>(null);
    const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);

    const [isOpen, setIsOpen] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);

    // Expose the xterm Terminal + shell control to parent via ref
    useImperativeHandle(ref, () => ({
      get terminal() {
        return xtermRef.current;
      },
      get shellProcess() {
        return processRef.current;
      },
      async resetShell() {
        // 1. Kill the old shell process
        if (writerRef.current) {
          try { writerRef.current.close(); } catch { /* already closed */ }
          writerRef.current = null;
        }
        if (processRef.current) {
          try { processRef.current.kill(); } catch { /* already exited */ }
          processRef.current = null;
        }

        // 2. Clear the terminal display (scrollback + viewport)
        const term = xtermRef.current;
        if (term) {
          term.clear();
          term.write("\x1bc"); // full reset escape sequence
        }

        // 3. Spawn a fresh jsh shell
        if (term) {
          await spawnShell(term);
        }
      },
      async writeToShell(data: string) {
        if (writerRef.current) {
          await writerRef.current.write(data);
        }
      },
    }));

    // ── Spawn the shell and wire up I/O ──
    const spawnShell = useCallback(
      async (terminal: Terminal) => {
        const process = await instance.spawn("jsh", {
          terminal: {
            cols: terminal.cols,
            rows: terminal.rows,
          },
        });

        processRef.current = process;

        // stdout → xterm
        process.output.pipeTo(
          new WritableStream({
            write(data) {
              terminal.write(data);
            },
          })
        );

        // xterm → stdin
        const writer = process.input.getWriter();
        writerRef.current = writer;

        terminal.onData((data) => {
          writer.write(data);
        });

        return process;
      },
      [instance]
    );

    // ── Initialize terminal ──
    useEffect(() => {
      if (!termRef.current || !isOpen || isMinimized) return;

      // Prevent double-init on HMR
      if (xtermRef.current) return;

      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize: 13,
        lineHeight: 1.4,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        theme: {
          background: "#0B0E14",
          foreground: "#d4d4d8",
          cursor: "#818cf8",
          selectionBackground: "#6366f133",
          black: "#0B0E14",
          red: "#f87171",
          green: "#34d399",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#22d3ee",
          white: "#d4d4d8",
          brightBlack: "#52525b",
          brightRed: "#fca5a5",
          brightGreen: "#6ee7b7",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#67e8f9",
          brightWhite: "#fafafa",
        },
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(termRef.current);

      // Fit immediately + after a brief delay (element may still be sizing)
      fitAddon.fit();
      const fitTimer = setTimeout(() => fitAddon.fit(), 100);

      xtermRef.current = terminal;
      fitRef.current = fitAddon;

      // Spawn the shell
      spawnShell(terminal);

      // Resize handler
      const handleResize = () => {
        fitAddon.fit();
        // Sync dimensions with the WebContainer process
        if (processRef.current) {
          processRef.current.resize({
            cols: terminal.cols,
            rows: terminal.rows,
          });
        }
      };

      window.addEventListener("resize", handleResize);

      // ResizeObserver for panel resize (not just window)
      const observer = new ResizeObserver(() => {
        fitAddon.fit();
        if (processRef.current) {
          processRef.current.resize({
            cols: terminal.cols,
            rows: terminal.rows,
          });
        }
      });
      if (termRef.current) observer.observe(termRef.current);

      return () => {
        clearTimeout(fitTimer);
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
        terminal.dispose();
        xtermRef.current = null;
        fitRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, isMinimized, spawnShell]);

    // ── Cleanup on unmount ──
    useEffect(() => {
      return () => {
        writerRef.current?.close().catch(() => { });
        processRef.current?.kill();
      };
    }, []);

    // ── Closed state ── just show a toggle button
    if (!isOpen) {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-lg bg-surface border border-border px-3 py-2 text-xs text-muted shadow-lg transition-colors hover:text-foreground hover:border-indigo/40"
          title="Open terminal"
        >
          <TerminalSquare className="h-3.5 w-3.5" />
          Terminal
        </button>
      );
    }

    return (
      <div
        className={`flex flex-col border-t border-border bg-[#0B0E14] transition-all ${isMinimized ? "h-8" : "h-[240px]"
          }`}
      >
        {/* Header bar */}
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/50 bg-surface/50 px-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <TerminalSquare className="h-3 w-3 text-indigo" />
            <span className="font-medium">Terminal</span>
            <span className="text-muted/50">jsh</span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsMinimized((m) => !m)}
              className="rounded p-0.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              title="Close terminal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal surface */}
        {!isMinimized && (
          <div
            ref={termRef}
            className="flex-1 overflow-hidden px-1 py-1"
          />
        )}
      </div>
    );
  });

WebTerminal.displayName = "WebTerminal";

export default WebTerminal;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TERMINAL PANEL — Placeholder until WebContainer boots
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Shows a beautiful boot sequence placeholder, then hands off to real xterm
 * once the WebContainer is ready.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { WebContainerManager } from "../webcontainer/manager";

interface TerminalPanelProps {
    onReady: () => void;
}

export default function TerminalPanel({ onReady }: TerminalPanelProps) {
    const termRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [booted, setBooted] = useState(false);

    useEffect(() => {
        if (!termRef.current || xtermRef.current) return;

        const term = new XTerm({
            theme: {
                background: "#0a0f1a",
                foreground: "#e2e8f0",
                cursor: "#38bdf8",
                cursorAccent: "#0a0f1a",
                selectionBackground: "rgba(56, 189, 248, 0.2)",
                black: "#1e293b",
                red: "#ef4444",
                green: "#22c55e",
                yellow: "#f59e0b",
                blue: "#38bdf8",
                magenta: "#a78bfa",
                cyan: "#22d3ee",
                white: "#e2e8f0",
            },
            fontSize: 13,
            fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
            cursorBlink: true,
            cursorStyle: "bar",
            allowTransparency: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(termRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Boot sequence
        term.writeln("");
        term.writeln("  \x1b[36m⚡ SouthStack Terminal\x1b[0m");
        term.writeln("  \x1b[90m─────────────────────────────\x1b[0m");
        term.writeln("");
        term.writeln("  \x1b[33m◌\x1b[0m  Booting WebContainer...");

        const mgr = WebContainerManager.getInstance();

        mgr.onTerminalData((data: string) => {
            term.write(data);
        });

        term.onData((data: string) => {
            mgr.writeToProcess(data);
        });

        mgr
            .boot()
            .then(async () => {
                await mgr.seedProject();
                term.writeln("  \x1b[32m✓\x1b[0m  WebContainer ready.");
                term.writeln("  \x1b[32m✓\x1b[0m  Node.js runtime active.");
                term.writeln("");
                term.writeln("  \x1b[90mPress ▶ Run to execute code.\x1b[0m");
                term.writeln("");
                setBooted(true);
                onReady();
            })
            .catch((err) => {
                term.writeln(
                    `  \x1b[31m✗\x1b[0m  Boot failed: ${err.message}`
                );
                term.writeln("  \x1b[90mWebContainers require cross-origin isolation.\x1b[0m");
            });

        const handleResize = () => fitAddon.fit();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            term.dispose();
            xtermRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="terminal-panel">
            <div className="terminal-panel-header">
                <div className="terminal-panel-header-left">
                    <span className="terminal-panel-title">Terminal</span>
                    <span className={`terminal-panel-status ${booted ? "terminal-booted" : "terminal-booting"}`}>
                        {booted ? "● Booted" : "◌ Booting…"}
                    </span>
                </div>
            </div>
            <div className="terminal-panel-body" ref={termRef} />
        </div>
    );
}

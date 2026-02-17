"use client";

/**
 * PreviewPane — Memoized, strictly-manual iframe preview for WebContainer dev servers.
 *
 * The iframe loads its src **once** when the server becomes ready and never
 * touches it again until the user clicks the dedicated Refresh button.
 *
 * Key design decisions:
 *   - Wrapped in React.memo with a shallow port-list comparator so parent
 *     re-renders (e.g. from editor keystrokes) do NOT propagate here.
 *   - The live URL is stored in a ref, not state, so changes never trigger
 *     a React re-render.
 *   - An integer `refreshKey` drives `<iframe key={refreshKey} />`. The only
 *     way to reload the iframe is to increment that key via the Refresh button.
 *   - No useEffect watches code/content/file variables.
 */

import { waitForPreview } from "@/lib/preview-ping";
import {
    Globe,
    Loader2,
    RefreshCw,
    X,
} from "lucide-react";
import {
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

// ─── Types ──────────────────────────────────────────────────

export interface PreviewPort {
  port: number;
  url: string;
}

interface PreviewPaneProps {
  /** List of active server ports + URLs from the editor. */
  ports: PreviewPort[];
  /** Called when the user clicks the close (×) button. */
  onClose?: () => void;
  /** True while the splitter is being dragged — shows ghost overlay. */
  isDragging?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

/** Shallow-compare two PreviewPort arrays by value, not reference. */
function portsEqual(a: PreviewPort[], b: PreviewPort[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].port !== b[i].port || a[i].url !== b[i].url) return false;
  }
  return true;
}

// ─── Component ──────────────────────────────────────────────

const PreviewPane = memo<PreviewPaneProps>(
  function PreviewPane({ ports, onClose, isDragging = false }) {
    // ── Which port tab is selected ──
    const [activePort, setActivePort] = useState<number | null>(null);

    // ── Loading spinner until first ping succeeds ──
    const [isPinging, setIsPinging] = useState(false);

    // ── Ref-based URL — never causes a re-render ──
    const resolvedUrlRef = useRef<string | null>(null);

    // ── Key-based hard refresh: only way to reload the iframe ──
    const [refreshKey, setRefreshKey] = useState(0);
    const [iframeReady, setIframeReady] = useState(false);

    // ── Tracks which port we have already pinged & loaded ──
    const loadedPortRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // ── Sync active port when the port list changes ──
    // Only fires when an actual port value appears/disappears.
    useEffect(() => {
      if (ports.length === 0) {
        setActivePort(null);
        setIframeReady(false);
        resolvedUrlRef.current = null;
        loadedPortRef.current = null;
        return;
      }

      setActivePort((prev) => {
        // Keep the current selection if it still exists
        if (prev !== null && ports.some((p) => p.port === prev)) return prev;
        // Otherwise pick the first
        return ports[0].port;
      });
    }, [ports]);

    // ── Ping the active port ONCE, then set the iframe src ──
    // This effect only re-runs when the *numeric* activePort changes,
    // NOT on every parent re-render.
    useEffect(() => {
      if (activePort === null) return;

      // Already loaded this port — do nothing
      if (loadedPortRef.current === activePort && iframeReady) return;

      const entry = ports.find((p) => p.port === activePort);
      if (!entry) return;

      // Abort any in-flight ping from a previous port switch
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsPinging(true);
      setIframeReady(false);

      waitForPreview(entry.url, {
        timeout: 15_000,
        interval: 500,
        signal: controller.signal,
      })
        .then((ok) => {
          if (controller.signal.aborted) return;
          if (ok) {
            resolvedUrlRef.current = entry.url;
            loadedPortRef.current = activePort;
            setIframeReady(true);
          }
          setIsPinging(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // Show the iframe anyway so the user can see an error page
          resolvedUrlRef.current = entry.url;
          loadedPortRef.current = activePort;
          setIframeReady(true);
          setIsPinging(false);
        });

      return () => {
        controller.abort();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePort]);

    // ── Hard-refresh handler (the ONLY way to reload the iframe) ──
    const handleRefresh = useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []);

    // ── Nothing to preview ──
    if (ports.length === 0) {
      return null;
    }

    // Derive display URL for the URL bar (read from ref, not state)
    const activeEntry = ports.find((p) => p.port === activePort);
    const displayUrl = resolvedUrlRef.current ?? activeEntry?.url ?? null;

    return (
      <div className="flex flex-col bg-[#0B0E14] h-full w-full">
        {/* ─── Header / Port Tabs ─── */}
        <div className="flex items-center justify-between border-b border-border/50 bg-surface/50 px-2 py-1 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto">
            {ports.map((p) => (
              <button
                key={p.port}
                onClick={() => {
                  if (p.port !== activePort) {
                    // Switching to a different port resets the loaded state
                    loadedPortRef.current = null;
                    setActivePort(p.port);
                  }
                }}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                  p.port === activePort
                    ? "bg-indigo/20 text-indigo-light"
                    : "text-muted hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Globe className="h-3 w-3" />
                :{p.port}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={handleRefresh}
              className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              title="Refresh preview"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
                title="Close preview"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* ─── URL Bar ─── */}
        <div className="flex items-center border-b border-border/30 bg-surface/30 px-3 py-1 shrink-0">
          <span className="truncate text-[11px] text-muted/70 select-all">
            {displayUrl ?? "No server running"}
          </span>
        </div>

        {/* ─── Iframe / Loading State ─── */}
        <div className="relative flex-1 min-h-0">
          {/* Ghost overlay — blocks iframe mouse events during splitter drag */}
          {isDragging && (
            <div className="absolute inset-0 z-20" />
          )}

          {/* Spinner while pinging */}
          {isPinging && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0B0E14]">
              <Loader2 className="h-6 w-6 animate-spin text-indigo" />
              <span className="text-xs text-muted">
                Waiting for server on port {activePort}…
              </span>
            </div>
          )}

          {/* The iframe — always mounted once ready, src set once, only key changes on manual refresh */}
          {iframeReady && resolvedUrlRef.current && (
            <iframe
              key={refreshKey}
              src={resolvedUrlRef.current}
              title={`Preview — port ${activePort}`}
              className="h-full w-full border-0 bg-white"
              style={{ pointerEvents: isDragging ? "none" : "auto" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              allow="cross-origin-isolated; clipboard-read; clipboard-write"
            />
          )}

          {/* No URL available fallback */}
          {!isPinging && !iframeReady && !displayUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0B0E14]">
              <Globe className="h-8 w-8 text-muted/20" />
              <span className="text-xs text-muted/60">
                No server running
              </span>
            </div>
          )}
        </div>
      </div>
    );
  },

  // ── Custom comparator — prevents re-render from parent keystroke state changes ──
  (prev, next) => {
    if (prev.isDragging !== next.isDragging) return false;
    if (prev.onClose !== next.onClose) return false;
    if (!portsEqual(prev.ports, next.ports)) return false;
    return true; // props are equal → skip re-render
  }
);

export default PreviewPane;

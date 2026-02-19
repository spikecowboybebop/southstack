/**
 * ai-engine.ts — Global AI Engine singleton via React Context.
 *
 * Architecture:
 *   AIProvider       — creates the Web Worker ONCE when mounted high in the
 *                      tree (e.g. wrapping the entire editor page).  State
 *                      (model load progress, messages capability flags) lives
 *                      here and is never lost when ChatSidebar hides/unmounts.
 *   useAIEngine()    — lightweight consumer hook.  Any component inside the
 *                      provider can read engine state or trigger actions.
 *
 * Worker lifecycle:
 *   The worker is spawned when AIProvider mounts and terminated only when it
 *   unmounts (i.e. when the user navigates away from the editor).  Toggling
 *   the chat sidebar has zero effect on the worker.
 */

"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

// ─── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIStatus =
  | "idle"        // No model loaded
  | "loading"     // Downloading / initialising model
  | "ready"       // Model loaded, ready for prompts
  | "generating"  // Currently streaming a response
  | "error";      // Something went wrong

export interface AIEngineState {
  status: AIStatus;
  modelId: string | null;
  loadProgress: number;   // 0–1
  loadText: string;       // Human-readable progress line
  /** Current loading phase (only meaningful while status === "loading"). */
  loadPhase: "standard" | "expert-weights" | "tokenizer" | "config";
  /** True if the fallback model was loaded due to insufficient VRAM. */
  isFallback: boolean;
  error: string | null;
  hasGPU: boolean | null;
  /** True if the browser's GPU has enough VRAM for Qwen3-Coder-Next (≥4 GB). */
  hasHighVRAM: boolean | null;
}

export interface UseAIEngineReturn extends AIEngineState {
  /** Load (or re-load) the LLM.  Pass null to auto-detect best model. */
  loadModel: (modelId?: string | null) => void;
  /** Send a streaming chat completion. */
  chat: (
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: (fullText: string) => void,
    onError?: (error: string) => void
  ) => void;
  /** Abort an in-flight generation. */
  abort: () => void;
}

// ─── Context ────────────────────────────────────────────────

const AIContext = createContext<UseAIEngineReturn | null>(null);

// ─── Provider ───────────────────────────────────────────────

interface AIProviderProps {
  children: ReactNode;
}

/**
 * AIProvider — mount this once, high in the component tree (e.g. wrapping
 * the editor page).  It creates the Web Worker exactly once and keeps it
 * alive independently of any chat UI that may mount/unmount.
 */
export function AIProvider({ children }: AIProviderProps) {
  const workerRef = useRef<Worker | null>(null);
  const callbacksRef = useRef<{
    onToken?: (token: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (error: string) => void;
  }>({});

  const [state, setState] = useState<AIEngineState>({
    status: "idle",
    modelId: null,
    loadProgress: 0,
    loadText: "",
    loadPhase: "standard",
    isFallback: false,
    error: null,
    hasGPU: null,
    hasHighVRAM: null,
  });

  // ── Detect WebGPU + estimate VRAM on mount ──
  // This runs on the main thread before the worker spawns so the "idle"
  // state already shows the correct model label immediately.
  useEffect(() => {
    (async () => {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        setState((s) => ({ ...s, hasGPU: false, hasHighVRAM: false }));
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator as any).gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        if (!adapter) {
          setState((s) => ({ ...s, hasGPU: false, hasHighVRAM: false }));
          return;
        }
        const VRAM_THRESHOLD = 4 * 1024 * 1024 * 1024;
        setState((s) => ({
          ...s,
          hasGPU: true,
          hasHighVRAM: adapter.limits.maxBufferSize >= VRAM_THRESHOLD / 2,
        }));
      } catch {
        setState((s) => ({ ...s, hasGPU: false, hasHighVRAM: false }));
      }
    })();
  }, []);

  // ── Spawn the Web Worker exactly ONCE, then immediately begin loading ──
  useEffect(() => {
    const worker = new Worker("/ai-worker.js", { type: "module" });
    workerRef.current = worker;

    worker.addEventListener("message", (e: MessageEvent) => {
      const data = e.data;

      switch (data.type) {
        // Worker detected GPU capabilities (fired before model load begins)
        case "capabilities":
          setState((s) => ({
            ...s,
            hasGPU: data.hasGPU,
            hasHighVRAM: data.hasHighVRAM,
          }));
          break;

        case "init-progress":
          setState((s) => ({
            ...s,
            status: "loading",
            loadProgress: data.progress ?? 0,
            loadText: data.text ?? "Loading…",
            loadPhase: data.phase ?? "standard",
            error: null,
          }));
          break;

        case "init-done":
          setState((s) => ({
            ...s,
            status: "ready",
            modelId: data.modelId,
            loadProgress: 1,
            loadText: "Model ready",
            loadPhase: "standard",
            isFallback: data.fallback === true,
            error: null,
          }));
          break;

        case "init-error":
          setState((s) => ({ ...s, status: "error", error: data.error }));
          break;

        // Heartbeat from worker — suppress unhandled-message console warnings
        case "heartbeat":
          break;

        case "token": {
          const tok = data.token;
          if (tok === undefined || tok === null || tok === "") break;
          callbacksRef.current.onToken?.(tok);
          break;
        }

        case "done": {
          setState((s) => ({ ...s, status: "ready" }));
          const ft =
            typeof data.fullText === "string" ? data.fullText : undefined;
          callbacksRef.current.onDone?.(ft as string);
          break;
        }

        case "error":
          setState((s) => ({ ...s, status: "ready", error: data.error }));
          callbacksRef.current.onError?.(data.error);
          break;
      }
    });

    // Auto-load immediately — no manual "Load Model" click needed.
    // The worker picks the best model (Qwen3-Coder-Next or fallback) based
    // on VRAM available and caches weights in IndexedDB for fast repeat loads.
    setState((s) => ({
      ...s,
      status: "loading",
      loadProgress: 0,
      loadText: "System initializing…",
      loadPhase: "standard",
      error: null,
    }));
    worker.postMessage({ type: "init", modelId: null });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Actions ──
  const loadModel = useCallback((modelId?: string | null) => {
    if (!workerRef.current) return;
    setState((s) => ({
      ...s,
      status: "loading",
      loadProgress: 0,
      loadText: "Preparing…",
      loadPhase: "standard",
      error: null,
    }));
    workerRef.current.postMessage({ type: "init", modelId: modelId ?? null });
  }, []);

  const chat = useCallback(
    (
      messages: ChatMessage[],
      onToken: (token: string) => void,
      onDone: (fullText: string) => void,
      onError?: (error: string) => void
    ) => {
      if (!workerRef.current) return;
      callbacksRef.current = { onToken, onDone, onError };
      setState((s) => ({ ...s, status: "generating", error: null }));
      workerRef.current.postMessage({ type: "chat", messages });
    },
    []
  );

  const abort = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: "abort" });
    setState((s) => ({ ...s, status: "ready" }));
  }, []);

  const value: UseAIEngineReturn = { ...state, loadModel, chat, abort };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

// ─── Consumer hook ──────────────────────────────────────────

/**
 * useAIEngine — subscribe to the global AI engine.
 * Must be called inside an <AIProvider>.
 */
export function useAIEngine(): UseAIEngineReturn {
  const ctx = useContext(AIContext);
  if (!ctx) {
    throw new Error("useAIEngine must be used within <AIProvider>");
  }
  return ctx;
}

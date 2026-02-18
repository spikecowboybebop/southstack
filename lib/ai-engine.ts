/**
 * ai-engine.ts — Main-thread bridge to the AI Web Worker.
 *
 * Provides a React-friendly hook (useAIEngine) that manages:
 *   - Worker lifecycle (spawn / terminate)
 *   - Model loading with progress tracking
 *   - Streaming chat completions
 *   - WebGPU detection + fallback model selection
 *
 * All heavy LLM computation runs in the worker — this file only
 * handles message passing and state updates.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIStatus =
  | "idle"           // No model loaded
  | "loading"        // Downloading / initializing model
  | "ready"          // Model loaded, ready for prompts
  | "generating"     // Currently streaming a response
  | "error";         // Something went wrong

export interface AIEngineState {
  status: AIStatus;
  modelId: string | null;
  loadProgress: number;     // 0–1
  loadText: string;         // Human-readable progress line
  error: string | null;
}

export interface UseAIEngineReturn extends AIEngineState {
  /** Load (or re-load) the LLM. Pass null to auto-detect best model. */
  loadModel: (modelId?: string | null) => void;
  /** Send a chat completion request. Streams tokens via onToken. */
  chat: (
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: (fullText: string) => void,
    onError?: (error: string) => void
  ) => void;
  /** Abort an in-flight generation. */
  abort: () => void;
  /** True if WebGPU is available in this browser. */
  hasGPU: boolean | null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useAIEngine(): UseAIEngineReturn {
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
    error: null,
  });

  const [hasGPU, setHasGPU] = useState<boolean | null>(null);

  // Detect WebGPU on mount
  useEffect(() => {
    (async () => {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        setHasGPU(false);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gpu = (navigator as any).gpu;
        const adapter = await gpu.requestAdapter();
        setHasGPU(adapter !== null);
      } catch {
        setHasGPU(false);
      }
    })();
  }, []);

  // Spawn worker on mount
  useEffect(() => {
    const worker = new Worker("/ai-worker.js", { type: "module" });
    workerRef.current = worker;

    worker.addEventListener("message", (e: MessageEvent) => {
      const data = e.data;

      switch (data.type) {
        case "init-progress":
          setState((s) => ({
            ...s,
            status: "loading",
            loadProgress: data.progress,
            loadText: data.text,
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
            error: null,
          }));
          break;

        case "init-error":
          setState((s) => ({
            ...s,
            status: "error",
            error: data.error,
          }));
          break;

        case "token":
          callbacksRef.current.onToken?.(data.token);
          break;

        case "done":
          setState((s) => ({ ...s, status: "ready" }));
          callbacksRef.current.onDone?.(data.fullText);
          break;

        case "error":
          setState((s) => ({ ...s, status: "ready", error: data.error }));
          callbacksRef.current.onError?.(data.error);
          break;
      }
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const loadModel = useCallback((modelId?: string | null) => {
    if (!workerRef.current) return;
    setState((s) => ({
      ...s,
      status: "loading",
      loadProgress: 0,
      loadText: "Preparing…",
      error: null,
    }));
    workerRef.current.postMessage({
      type: "init",
      modelId: modelId ?? null,
    });
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

  return {
    ...state,
    loadModel,
    chat,
    abort,
    hasGPU,
  };
}

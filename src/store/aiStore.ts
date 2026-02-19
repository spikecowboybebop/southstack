/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERABLE 3a — Zustand AI Store  (src/store/aiStore.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Central state for all AI-related concerns:
 *   • Which model is active / loading
 *   • Download progress (0-100%)
 *   • Chat message history
 *   • Worker lifecycle
 *
 * This store is consumed by the `useAI` hook and React components.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { create } from "zustand";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, type ModelInfo } from "../models";

// ── Types ───────────────────────────────────────────────────────────────────

export type AIStatus =
  | "idle"              // No model loaded yet
  | "loading"           // Downloading / compiling model
  | "ready"             // Model loaded, ready for inference
  | "generating"        // Currently streaming a response
  | "error";            // Something went wrong

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIState {
  // ── Model ─────────────────────────────────────────────────
  availableModels: ModelInfo[];
  currentModelId: string;
  status: AIStatus;
  statusText: string;
  downloadProgress: number;       // 0 → 100

  // ── Chat ──────────────────────────────────────────────────
  messages: ChatMessage[];
  streamingContent: string;       // partial response while generating

  // ── Worker ref (not serialized) ───────────────────────────
  worker: Worker | null;

  // ── Actions ───────────────────────────────────────────────
  setWorker: (w: Worker) => void;
  setStatus: (s: AIStatus, text?: string) => void;
  setDownloadProgress: (p: number) => void;
  setCurrentModelId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setStreamingContent: (c: string) => void;
  appendStreamingContent: (delta: string) => void;
  clearChat: () => void;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useAIStore = create<AIState>((set) => ({
  availableModels: AVAILABLE_MODELS,
  currentModelId: DEFAULT_MODEL_ID,
  status: "idle",
  statusText: "Select a model to begin",
  downloadProgress: 0,
  messages: [],
  streamingContent: "",
  worker: null,

  /** Store the Web Worker reference (not serializable — kept outside persistence). */
  setWorker: (w) => set({ worker: w }),
  /** Update AI status and optional human-readable status text. */
  setStatus: (s, text) =>
    set({ status: s, statusText: text ?? s }),
  /** Update model download progress (0–100%). */
  setDownloadProgress: (p) =>
    set({ downloadProgress: p }),
  /** Switch the currently selected model ID. */
  setCurrentModelId: (id) =>
    set({ currentModelId: id }),
  /** Append a complete message (user or assistant) to the chat history. */
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  /** Replace the entire streaming content buffer (used at stream start). */
  setStreamingContent: (c) =>
    set({ streamingContent: c }),
  /** Append a delta chunk to the streaming buffer during generation. */
  appendStreamingContent: (delta) =>
    set((state) => ({ streamingContent: state.streamingContent + delta })),
  /** Clear all messages and streaming content. */
  clearChat: () =>
    set({ messages: [], streamingContent: "" }),
}));

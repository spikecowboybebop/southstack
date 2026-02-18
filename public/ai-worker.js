/**
 * ai-worker.js — Web Worker for local LLM inference via WebLLM.
 *
 * Runs the heavy LLM computation off the main thread so the editor,
 * terminal, and WebContainer remain responsive.
 *
 * Communication protocol (postMessage):
 *
 *   Main → Worker:
 *     { type: "init",   modelId: string }     — Load/download model
 *     { type: "chat",   messages: Message[] }  — Start a chat completion
 *     { type: "abort" }                        — Cancel in-flight generation
 *
 *   Worker → Main:
 *     { type: "init-progress", progress: number, text: string }
 *     { type: "init-done", modelId: string }
 *     { type: "init-error", error: string }
 *     { type: "token", token: string }         — Streaming token
 *     { type: "done", fullText: string }       — Generation complete
 *     { type: "error", error: string }
 *
 * The worker dynamically imports @mlc-ai/web-llm from a CDN at runtime.
 */

/* eslint-disable no-restricted-globals */

/** @type {any} */
let engine = null;

/** @type {AbortController | null} */
let abortController = null;

/**
 * Model configurations.
 * WebGPU-capable browsers get a larger model; CPU-only gets a tiny one.
 */
const MODEL_OPTIONS = {
  // Good balance for WebGPU-capable browsers
  "webgpu": "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
  // Fallback for CPU-only (very small, still useful)
  "cpu": "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
};

/**
 * Detect WebGPU support inside the worker.
 * Workers don't have `document` but do have `navigator.gpu`.
 */
async function hasWebGPU() {
  if (typeof navigator === "undefined") return false;
  if (!("gpu" in navigator)) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Initialize the WebLLM engine with the specified model.
 * Downloads the model weights to IndexedDB on first run.
 */
async function initEngine(requestedModelId) {
  try {
    // Dynamic import from CDN — works in Web Workers
    const webllm = await import(
      /* webpackIgnore: true */
      "https://esm.run/@mlc-ai/web-llm"
    );

    // Determine backend + model
    const gpuAvailable = await hasWebGPU();
    const backend = gpuAvailable ? "webgpu" : "cpu";
    const modelId = requestedModelId || MODEL_OPTIONS[backend];

    self.postMessage({
      type: "init-progress",
      progress: 0,
      text: `Loading ${modelId} (${backend})…`,
    });

    // Create the engine with progress callback
    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        self.postMessage({
          type: "init-progress",
          progress: report.progress ?? 0,
          text: report.text ?? "Loading…",
        });
      },
    });

    self.postMessage({ type: "init-done", modelId });
  } catch (err) {
    self.postMessage({
      type: "init-error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Run a streaming chat completion.
 * Sends tokens back to the main thread one at a time.
 */
async function runChat(messages) {
  if (!engine) {
    self.postMessage({
      type: "error",
      error: "Model not loaded. Click 'Load Model' first.",
    });
    return;
  }

  abortController = new AbortController();

  try {
    let fullText = "";

    const chunks = await engine.chat.completions.create({
      messages,
      temperature: 0.3,
      max_tokens: 4096,
      stream: true,
    });

    for await (const chunk of chunks) {
      if (abortController.signal.aborted) break;

      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        self.postMessage({ type: "token", token: delta });
      }
    }

    if (!abortController.signal.aborted) {
      self.postMessage({ type: "done", fullText });
    }
  } catch (err) {
    if (!abortController?.signal.aborted) {
      self.postMessage({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    abortController = null;
  }
}

// ─── Message Handler ────────────────────────────────────────

self.addEventListener("message", (e) => {
  const { type } = e.data;

  switch (type) {
    case "init":
      initEngine(e.data.modelId);
      break;
    case "chat":
      runChat(e.data.messages);
      break;
    case "abort":
      abortController?.abort();
      abortController = null;
      break;
    default:
      console.warn("[ai-worker] Unknown message type:", type);
  }
});

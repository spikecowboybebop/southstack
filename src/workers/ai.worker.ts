/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERABLE 2 — AI Web Worker  (src/workers/ai.worker.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file runs in a dedicated Web Worker thread — it NEVER touches the DOM.
 * All AI inference happens here, keeping the main UI thread fully responsive.
 *
 * Architecture:
 *   Main Thread  ←→  postMessage  ←→  This Worker  ←→  WebLLM (WebGPU)
 *
 * Messages FROM the main thread:
 *   { type: "LOAD_MODEL",  modelId: string }
 *   { type: "GENERATE",    messages: ChatMessage[], requestId: string }
 *   { type: "ABORT" }
 *
 * Messages TO the main thread:
 *   { type: "LOAD_PROGRESS", progress: number, timeElapsed: number, text: string }
 *   { type: "MODEL_LOADED",  modelId: string }
 *   { type: "MODEL_ERROR",   error: string }
 *   { type: "GENERATE_DELTA", requestId: string, delta: string }
 *   { type: "GENERATE_DONE",  requestId: string, fullText: string }
 *   { type: "GENERATE_ERROR", requestId: string, error: string }
 *
 * How WebLLM caches model weights:
 *   WebLLM uses the browser Cache Storage API internally (cache name: "webllm/model").
 *   On first load it fetches weight shards from HuggingFace, chunks them, and stores
 *   them in Cache Storage.  Subsequent loads (even offline) read directly from cache.
 *   The PWA service worker (vite-plugin-pwa) does NOT manage these huge files —
 *   it only caches the lightweight app shell.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MLCEngine,
  type InitProgressReport,
  type ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

// ── Types for messages ─────────────────────────────────────────────────────

interface LoadModelMessage {
  type: "LOAD_MODEL";
  modelId: string;
}

interface GenerateMessage {
  type: "GENERATE";
  messages: ChatCompletionMessageParam[];
  requestId: string;
}

interface AbortMessage {
  type: "ABORT";
}

type WorkerInMessage = LoadModelMessage | GenerateMessage | AbortMessage;

// ── Worker state ────────────────────────────────────────────────────────────

let engine: MLCEngine | null = null;
let currentModelId: string | null = null;
let isGenerating = false;

/**
 * Get or create the MLCEngine singleton.
 * The engine is created once and reused; calling `engine.reload(newModelId)`
 * swaps the active model (unloads old weights from GPU, loads new ones).
 */
function getEngine(): MLCEngine {
  if (!engine) {
    engine = new MLCEngine();

    // Wire up the progress callback so the UI gets live download %
    engine.setInitProgressCallback((report: InitProgressReport) => {
      self.postMessage({
        type: "LOAD_PROGRESS",
        progress: report.progress,       // 0 → 1
        timeElapsed: report.timeElapsed,  // seconds
        text: report.text,                // human-readable status
      });
    });
  }
  return engine;
}

// ── Message handler ─────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    // ────────────────────────────────────────────────────────────────────────
    // LOAD_MODEL — switch to a new model (or re-load the same one)
    // ────────────────────────────────────────────────────────────────────────
    case "LOAD_MODEL": {
      try {
        const e = getEngine();

        // If a different model is already loaded, unload it first.
        // This frees GPU memory so the new model can allocate.
        if (currentModelId && currentModelId !== msg.modelId) {
          await e.unload();
        }

        // `reload` will:
        //   1. Check Cache Storage for existing weights
        //   2. Download missing shards (triggering progress callbacks)
        //   3. Compile & upload to WebGPU
        await e.reload(msg.modelId);
        currentModelId = msg.modelId;

        self.postMessage({ type: "MODEL_LOADED", modelId: msg.modelId });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: "MODEL_ERROR", error: message });
      }
      break;
    }

    // ────────────────────────────────────────────────────────────────────────
    // GENERATE — streaming chat completion
    // ────────────────────────────────────────────────────────────────────────
    case "GENERATE": {
      if (!engine || !currentModelId) {
        self.postMessage({
          type: "GENERATE_ERROR",
          requestId: msg.requestId,
          error: "No model loaded. Please load a model first.",
        });
        break;
      }

      isGenerating = true;
      let fullText = "";

      try {
        // Use the OpenAI-compatible streaming API
        const asyncIterator = await engine.chat.completions.create({
          messages: msg.messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 2048,
        });

        for await (const chunk of asyncIterator) {
          if (!isGenerating) break; // ABORT was received

          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            fullText += delta;
            self.postMessage({
              type: "GENERATE_DELTA",
              requestId: msg.requestId,
              delta,
            });
          }
        }

        self.postMessage({
          type: "GENERATE_DONE",
          requestId: msg.requestId,
          fullText,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({
          type: "GENERATE_ERROR",
          requestId: msg.requestId,
          error: message,
        });
      } finally {
        isGenerating = false;
      }
      break;
    }

    // ────────────────────────────────────────────────────────────────────────
    // ABORT — interrupt an ongoing generation
    // ────────────────────────────────────────────────────────────────────────
    case "ABORT": {
      isGenerating = false;
      if (engine) {
        await engine.interruptGenerate();
      }
      break;
    }
  }
};

import { useEffect, useCallback, useRef } from "react";
import { useAIStore, type ChatMessage } from "../store/aiStore";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "../models";

// Worker singleton (module-level so React strict-mode double-mount is safe)
let workerInstance: Worker | null = null;

/** Ensure the worker is spawned and wired up. Does NOT load a model. */
function ensureWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("../workers/ai.worker.ts", import.meta.url),
      { type: "module" }
    );

    workerInstance.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      const s = useAIStore.getState();

      switch (msg.type) {
        case "LOAD_PROGRESS": {
          const pct = Math.round(msg.progress * 100);
          s.setDownloadProgress(pct);
          s.setStatus("loading", msg.text);
          break;
        }
        case "MODEL_LOADED":
          s.setDownloadProgress(100);
          s.setCurrentModelId(msg.modelId);
          s.setStatus("ready", "Model ready \u2014 offline capable");
          break;

        case "MODEL_ERROR":
          s.setStatus("error", `Load failed: ${msg.error}`);
          break;

        case "GENERATE_DELTA":
          s.appendStreamingContent(msg.delta);
          break;

        case "GENERATE_DONE":
          s.addMessage({ role: "assistant", content: msg.fullText });
          s.setStreamingContent("");
          s.setStatus("ready", "Model ready \u2014 offline capable");
          break;

        case "GENERATE_ERROR":
          s.setStatus("error", `Generation error: ${msg.error}`);
          s.setStreamingContent("");
          break;
      }
    };

    workerInstance.onerror = (err) => {
      useAIStore
        .getState()
        .setStatus("error", `Worker error: ${err.message}`);
    };

    useAIStore.getState().setWorker(workerInstance);
  }
  return workerInstance;
}

export function useAI() {
  const store = useAIStore();
  const initCalled = useRef(false);

  // Boot worker on first mount (no model auto-load)
  useEffect(() => {
    if (initCalled.current) return;
    initCalled.current = true;
    ensureWorker();
  }, []);

  // Explicitly load a model (call once to warm up)
  const loadModel = useCallback(
    (modelId?: string) => {
      const w = ensureWorker();
      const id = modelId ?? store.currentModelId ?? DEFAULT_MODEL_ID;
      if (store.status === "loading") return;
      store.setStatus("loading", "Initializing model\u2026");
      store.setDownloadProgress(0);
      store.setCurrentModelId(id);
      w.postMessage({ type: "LOAD_MODEL", modelId: id });
    },
    [store]
  );

  // Switch model (preserves chat, smooth transition)
  const switchModel = useCallback(
    (modelId: string) => {
      const w = ensureWorker();
      if (modelId === store.currentModelId && store.status === "ready") return;

      store.setStatus("loading", "Switching model\u2026");
      store.setDownloadProgress(0);
      store.setCurrentModelId(modelId);
      w.postMessage({ type: "LOAD_MODEL", modelId });
    },
    [store]
  );

  // Send a chat message
  const sendMessage = useCallback(
    (text: string) => {
      const w = ensureWorker();
      if (store.status !== "ready") return;

      const userMsg: ChatMessage = { role: "user", content: text };
      store.addMessage(userMsg);
      store.setStatus("generating", "Thinking\u2026");
      store.setStreamingContent("");

      const allMessages = [...useAIStore.getState().messages];

      w.postMessage({
        type: "GENERATE",
        messages: allMessages,
        requestId: crypto.randomUUID(),
      });
    },
    [store]
  );

  // Clear chat
  const clearChat = useCallback(() => {
    store.clearChat();
  }, [store]);

  // Public API
  const currentModel =
    AVAILABLE_MODELS.find((m) => m.id === store.currentModelId) ??
    AVAILABLE_MODELS[0];

  return {
    currentModel,
    availableModels: store.availableModels,
    status: store.status,
    statusText: store.statusText,
    downloadProgress: store.downloadProgress,
    messages: store.messages,
    streamingContent: store.streamingContent,
    loadModel,
    switchModel,
    sendMessage,
    clearChat,
  };
}

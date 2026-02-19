/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVAILABLE MODELS REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each entry maps a human-readable label to a `modelId` that exists in
 * WebLLM's `prebuiltAppConfig.model_list`.
 *
 * You can find the full list at:
 *   https://github.com/nicknisi/web-llm/blob/main/src/config.ts
 *   (look for the `model_list` array)
 *
 * The `size` field is approximate and shown in the UI dropdown so users
 * know what to expect before triggering a large download.
 *
 * ⚠️  Switching models triggers a download (500MB – 4GB).  After first
 * download, weights are cached in Cache Storage and loaded instantly.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export interface ModelInfo {
  /** Unique id — must match a `model_id` in WebLLM prebuiltAppConfig */
  id: string;
  /** Human-readable label for the dropdown */
  label: string;
  /** Approximate download size */
  size: string;
  /** Short description */
  description: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 Coder 1.5B",
    size: "~1.0 GB",
    description: "Fast & lightweight code model. Great for quick completions.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    size: "~1.8 GB",
    description: "Meta's compact Llama model. Good general-purpose assistant.",
  },
  {
    id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
    label: "Hermes 3 Llama 8B",
    size: "~4.3 GB",
    description: "Nous Research Hermes 3. Best quality, needs more VRAM.",
  },
  {
    id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
    label: "SmolLM2 1.7B",
    size: "~1.0 GB",
    description: "HuggingFace SmolLM2 — tiny, fast, good for chat.",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 Mini 3.8B",
    size: "~2.2 GB",
    description: "Microsoft Phi 3.5 — strong reasoning for its size.",
  },
];

/** Default model to load on first visit */
export const DEFAULT_MODEL_ID = AVAILABLE_MODELS[0].id;

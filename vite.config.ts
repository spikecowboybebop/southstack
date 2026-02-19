/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERABLE 1 — Vite Configuration
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Key responsibilities:
 *
 * 1. PWA CACHING (vite-plugin-pwa)
 *    - Precaches the "App Shell": all JS, CSS, HTML, WASM and font assets that
 *      Vite produces during `vite build`.
 *    - Uses a "prompt" update strategy so users can accept new versions.
 *    - Runtime-caches Google Fonts (or any CDN CSS/font) if you add one later.
 *
 *    ⚠️  AI Model Weights are NOT cached here.
 *    WebLLM stores weights in its own Cache Storage bucket
 *    ("webllm/model") automatically.  The PWA service worker only
 *    handles the *app shell*; models are fetched, chunked, and cached
 *    by the WebLLM engine inside the Web Worker.
 *
 * 2. CROSS-ORIGIN HEADERS
 *    WebContainers require `SharedArrayBuffer`, which needs:
 *      Cross-Origin-Opener-Policy:   same-origin
 *      Cross-Origin-Embedder-Policy: require-corp
 *    We inject them for *every* response (dev + preview).
 *
 * 3. WORKER BUNDLING
 *    Vite natively supports `new Worker(new URL(...), { type: 'module' })`.
 *    We make sure `.wasm` imports resolve correctly for WebLLM.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// ── Shared headers needed by WebContainers (SharedArrayBuffer) ──────────────
const coopCoepHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [
    react(),

    // ── PWA – caches the App Shell (HTML/JS/CSS/WASM) ──────────────────────
    VitePWA({
      // "prompt" → shows an "Update available" toast; user decides when to refresh.
      registerType: "prompt",

      // Include WASM files produced by any dependency (e.g. tree-sitter, etc.)
      includeAssets: [
        "favicon.ico",
        "robots.txt",
        "apple-touch-icon.png",
        "**/*.wasm",
      ],

      // Workbox controls what gets precached at install time.
      workbox: {
        // The AI worker bundle includes all of WebLLM (~5 MB).
        // Raise the limit so it gets precached for offline use.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB

        // Precache every asset Vite emits (JS chunks, CSS, HTML, WASM, images).
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}",
        ],

        // ── Runtime caching rules ────────────────────────────────────────
        runtimeCaching: [
          // Cache CDN fonts/CSS if we ever add Google Fonts, etc.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-css",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-woff",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Cache Monaco Editor workers loaded from CDN
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "cdn-assets",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // ── Web App Manifest ───────────────────────────────────────────────
      manifest: {
        name: "SouthStack",
        short_name: "SouthStack",
        description:
          "A zero-knowledge, offline-first development environment with local AI.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],

  // ── Dev server headers (required for WebContainers in dev mode) ───────────
  server: {
    headers: coopCoepHeaders,
  },

  // ── Preview server headers (for `vite preview` after build) ───────────────
  preview: {
    headers: coopCoepHeaders,
  },

  // ── Optimisation ──────────────────────────────────────────────────────────
  optimizeDeps: {
    // Exclude WebContainer from pre-bundling — it uses top-level await &
    // SharedArrayBuffer which confuse esbuild's optimizer.
    exclude: ["@webcontainer/api"],
  },

  worker: {
    format: "es",
  },

  build: {
    // The AI worker includes WebLLM (~5 MB); that's expected.
    chunkSizeWarningLimit: 6000, // kB
  },
});

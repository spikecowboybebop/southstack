import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * WebContainer requires cross-origin isolation:
   *   Cross-Origin-Embedder-Policy: credentialless
   *   Cross-Origin-Opener-Policy: same-origin
   *
   * These headers enable SharedArrayBuffer which WebContainer needs.
   *
   * IMPORTANT: We use "credentialless" instead of "require-corp" for COEP.
   * "require-corp" blocks all cross-origin sub-resource loads unless they
   * set CORP headers — this breaks WebContainer preview URLs served via
   * the Service Worker (causing the "Connect to Project" interstitial).
   * "credentialless" still enables SharedArrayBuffer but allows cross-origin
   * fetches without CORP, which is exactly what the preview ping + preview
   * tab need to work.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

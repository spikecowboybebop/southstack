import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * WebContainer requires cross-origin isolation:
   *   Cross-Origin-Embedder-Policy: require-corp
   *   Cross-Origin-Opener-Policy: same-origin
   *
   * These headers enable SharedArrayBuffer which WebContainer needs.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
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

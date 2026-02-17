/**
 * wc-server-headers — Cross-Origin Isolation header helpers for
 * dev servers running inside WebContainer.
 *
 * WebContainer serves preview URLs through a Service Worker proxy.
 * For features like SharedArrayBuffer to work inside the preview,
 * the inner dev server (Vite, Webpack, Next.js, etc.) must send:
 *
 *   Cross-Origin-Embedder-Policy: require-corp
 *   Cross-Origin-Opener-Policy: same-origin
 *
 * This module provides:
 *   1. Header constants shared across configs
 *   2. `viteConfigWithHeaders()` — Vite config with COEP/COOP headers
 *   3. `webpackDevServerHeaders()` — Webpack equivalent
 *   4. `expressMiddlewareSnippet()` — Express middleware
 *   5. `injectHeaderConfig()` — auto-patches a project's vite.config
 *      inside WebContainer with COEP/COOP headers
 *
 * ─────────────────────────────────────────────────────────────
 * Vite Config (generated):
 *
 *   export default defineConfig({
 *     server: {
 *       headers: { "Cross-Origin-Embedder-Policy": "require-corp", ... },
 *     },
 *   });
 * ─────────────────────────────────────────────────────────────
 */

import type { WebContainer } from "@webcontainer/api";

// ─── Header Constants ────────────────────────────────────────

export const COEP_HEADER = "Cross-Origin-Embedder-Policy";
export const COOP_HEADER = "Cross-Origin-Opener-Policy";
export const COEP_VALUE = "require-corp";
export const COOP_VALUE = "same-origin";

export const CROSS_ORIGIN_HEADERS: Record<string, string> = {
  [COEP_HEADER]: COEP_VALUE,
  [COOP_HEADER]: COOP_VALUE,
};

// ─── Vite Config Snippet ─────────────────────────────────────

/**
 * Returns a minimal `vite.config.ts` string that includes the
 * cross-origin isolation headers in `server.headers`.
 */
export function viteConfigWithHeaders(): string {
  return `import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
`;
}

// ─── Webpack Config Snippet ──────────────────────────────────

/**
 * Returns the webpack devServer.headers object as a config snippet.
 */
export function webpackDevServerHeaders(): string {
  return `// Add to your webpack.config.js → devServer:
module.exports = {
  // …existing config
  devServer: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
};
`;
}

// ─── Express Middleware Snippet ──────────────────────────────

/**
 * Returns an Express middleware snippet as a string.
 */
export function expressMiddlewareSnippet(): string {
  return `// Cross-origin isolation middleware
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});
`;
}

// ─── Auto-Inject into WebContainer FS ────────────────────────

/**
 * Detect the project type and inject COEP/COOP headers into
 * the appropriate config file inside WebContainer FS.
 *
 * Strategy:
 *   1. If `vite.config.ts` / `.js` / `.mjs` exists → patch with
 *      server.headers (COEP/COOP only).
 *   2. If none exists but `package.json` has a "vite" dep → create
 *      a minimal vite.config.ts with COEP/COOP headers.
 *   3. For express-based servers, log a warning.
 *
 * This is best-effort — it handles the common Vite case and
 * provides clear console output for manual cases.
 */
export async function injectHeaderConfig(
  instance: WebContainer
): Promise<"patched" | "created" | "skipped"> {
  // ── Check for existing vite config ──
  const viteConfigNames = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
  ];

  for (const name of viteConfigNames) {
    try {
      const raw = await instance.fs.readFile(`/${name}`, "utf-8");
      const content = typeof raw === "string" ? raw : new TextDecoder().decode(raw);

      // Already has COEP header → skip
      if (content.includes("Cross-Origin-Embedder-Policy")) {
        console.info(
          `[injectHeaderConfig] ${name} already has COEP header — skipping.`
        );
        return "skipped";
      }

      // Patch: inject server block into the defineConfig call
      const patched = patchViteConfig(content);
      if (patched !== content) {
        await instance.fs.writeFile(`/${name}`, patched);
        console.info(
          `[injectHeaderConfig] Patched ${name} with COEP/COOP headers.`
        );
        return "patched";
      }

      // Couldn't auto-patch — warn
      console.warn(
        `[injectHeaderConfig] Could not auto-patch ${name}. ` +
          `Add server.headers manually:\n${JSON.stringify(CROSS_ORIGIN_HEADERS, null, 2)}`
      );
      return "skipped";
    } catch {
      // File doesn't exist — continue
    }
  }

  // ── No vite config found — check if Vite is a dependency ──
  try {
    const raw = await instance.fs.readFile("/package.json", "utf-8");
    const pkgText = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const pkg = JSON.parse(pkgText) as Record<string, unknown>;

    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };

    if (deps.vite) {
      // Vite is installed but no config exists → create one
      await instance.fs.writeFile("/vite.config.ts", viteConfigWithHeaders());
      console.info(
        "[injectHeaderConfig] Created vite.config.ts with COEP/COOP headers."
      );
      return "created";
    }
  } catch {
    // No package.json — skip
  }

  console.info(
    "[injectHeaderConfig] No Vite config detected. " +
      "If you use Express/Webpack, add COEP/COOP headers manually."
  );
  return "skipped";
}

// ─── Internal: Patch Vite Config ─────────────────────────────

/**
 * Attempt to inject `server: { headers: { ... } }` into an
 * existing Vite config. Handles common patterns:
 *
 *   defineConfig({ ... })          → injects server block
 *   defineConfig({ server: {} })   → injects headers into server
 *   export default { ... }         → injects server block
 *
 * Returns the original content unchanged if it can't safely patch.
 */
function patchViteConfig(content: string): string {
  // If server.headers already exists, don't touch it
  if (content.includes("server") && content.includes("headers")) {
    return content;
  }

  const serverBlock = `  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },`;

  // Pattern 1: defineConfig({  → inject after opening brace
  const defineConfigMatch = content.match(
    /defineConfig\(\s*\{/
  );

  if (defineConfigMatch && defineConfigMatch.index !== undefined) {
    const insertPos = defineConfigMatch.index + defineConfigMatch[0].length;
    return (
      content.slice(0, insertPos) +
      "\n" +
      serverBlock +
      "\n" +
      content.slice(insertPos)
    );
  }

  // Pattern 2: export default {  → inject after opening brace
  const exportDefaultMatch = content.match(
    /export\s+default\s*\{/
  );

  if (exportDefaultMatch && exportDefaultMatch.index !== undefined) {
    const insertPos = exportDefaultMatch.index + exportDefaultMatch[0].length;
    return (
      content.slice(0, insertPos) +
      "\n" +
      serverBlock +
      "\n" +
      content.slice(insertPos)
    );
  }

  // Can't safely patch
  return content;
}

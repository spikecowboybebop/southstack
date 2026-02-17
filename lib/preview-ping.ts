/**
 * Preview Ping — health-check utility for WebContainer preview URLs.
 *
 * WebContainer serves preview URLs via a Service Worker proxy.
 * If the tab/iframe loads before the SW is fully registered and
 * "claiming" clients, the browser shows a "Connect to Project" /
 * "Almost there" interstitial page.
 *
 * This module provides:
 *   - `waitForPreview(url)` – polls the URL with `fetch()` until
 *     the actual dev server responds (not the SW boot page).
 *   - `waitForServiceWorker()` – waits until the SW controlling
 *     this page is in the "activated" state.
 *
 * Usage:
 *   const ok = await waitForPreview("https://abcd.local-credentialless.webcontainer-api.io");
 *   if (ok) window.open(url, "_blank");
 *
 * For iframes (preferred approach):
 *   const swReady = await waitForServiceWorker();
 *   const serverReady = await waitForPreview(url);
 *   if (swReady && serverReady) iframeRef.current.src = url;
 */

export interface PingOptions {
  /** Maximum time to wait before giving up (ms). Default: 10_000. */
  timeout?: number;
  /** Interval between pings (ms). Default: 500. */
  interval?: number;
  /** AbortSignal to cancel early (e.g. component unmount). */
  signal?: AbortSignal;
}

// ─── Service Worker Readiness ────────────────────────────────

/**
 * Wait until the Service Worker controlling this page is in
 * the "activated" state.  The WebContainer SDK registers a SW
 * during `boot()` — this function ensures it has finished
 * installing and is actively intercepting fetches.
 *
 * Returns `true` when the SW is ready, `false` on timeout/abort.
 *
 * If the browser doesn't support Service Workers or none is
 * registered, returns `true` immediately (nothing to wait for).
 */
export async function waitForServiceWorker(
  options?: PingOptions
): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return true; // SW not supported — nothing to wait for
  }

  const timeout = options?.timeout ?? 10_000;
  const interval = options?.interval ?? 300;
  const signal = options?.signal;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (signal?.aborted) return false;

    // Check if any SW is controlling this page
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.active?.state === "activated") {
      return true;
    }

    // Also check navigator.serviceWorker.controller
    if (navigator.serviceWorker.controller) {
      return true;
    }

    await sleep(interval, signal);
  }

  return false;
}

// ─── Preview URL Readiness ───────────────────────────────────

/**
 * Poll a URL until it responds, indicating the WebContainer SW
 * is proxying to the actual server (Vite, Express, etc.).
 *
 * How it works:
 *   1. Sends a `HEAD` request with `mode: "no-cors"` (the preview
 *      URL is cross-origin from the editor page).
 *   2. An opaque response (status 0) proves the SW is forwarding
 *      requests to the inner server — that's a success.
 *   3. A 2xx/3xx status (if somehow the response is transparent)
 *      also counts.
 *   4. If the fetch throws (network error, SW not ready), we
 *      retry after a brief interval.
 *
 * Returns `true` if the URL became responsive, `false` if timed
 * out or was aborted.
 *
 * Tip: For iframes, call `waitForServiceWorker()` first, *then*
 * `waitForPreview()`. This avoids the iframe loading the SW boot
 * page while the ping is still in flight.
 */
export async function waitForPreview(
  url: string,
  options?: PingOptions
): Promise<boolean> {
  const timeout = options?.timeout ?? 10_000;
  const interval = options?.interval ?? 500;
  const signal = options?.signal;

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // Bail if the caller aborted (e.g. user navigated away)
    if (signal?.aborted) return false;

    try {
      // Use no-cors mode — the SW URL is cross-origin but we only
      // care that *something* responds (not a SW boot page).
      // `mode: "no-cors"` gives an opaque response (status 0) which
      // still proves the SW is forwarding. HEAD is lightweight.
      const res = await fetch(url, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal,
      });

      // Opaque responses (status 0) from no-cors mean the server is
      // responding behind the SW — that's a success.
      // Standard 2xx/3xx also count.
      if (res.status === 0 || (res.status >= 200 && res.status < 400)) {
        return true;
      }
    } catch {
      // Network error / SW not ready yet — keep trying
    }

    await sleep(interval, signal);
  }

  return false;
}

// ─── Internal Helper ─────────────────────────────────────────

/** Sleep for `ms` with optional abort support. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  }).catch(() => {
    // Aborted — caller will check signal on next iteration
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PHASE 1 — SystemResourceController  (src/system/ResourceController.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Central resource manager for a 4GB RAM target.
 *
 * Problem:
 *   The AI Worker (~500MB–2GB VRAM/RAM) and the WebContainer runtime (~200MB)
 *   can easily exhaust a low-spec machine. We need a single controller that:
 *     1. Tracks which heavy services are alive
 *     2. Provides orderly shutdown (graceful)
 *     3. Provides panic shutdown (immediate, for OOM recovery)
 *     4. Prevents concurrent heavy loads when memory is low
 *
 * Design:
 *   - Singleton pattern — one controller per app instance
 *   - Services register themselves with a dispose callback
 *   - `panic()` calls ALL dispose callbacks synchronously, then clears state
 *   - Memory pressure detection via `performance.memory` (Chrome) or
 *     `navigator.deviceMemory` as a static hint
 *
 * Registered service types:
 *   - "ai-worker"      →  The WebLLM inference worker
 *   - "webcontainer"   →  The WebContainer Node.js runtime
 *   - "editor"         →  Monaco editor instance (can be lazy-disposed)
 *   - "terminal"       →  xterm.js instance
 *
 * Future: Can integrate with the `memory-pressure` Observer API when available
 * in more browsers.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type ServiceId =
  | "ai-worker"
  | "webcontainer"
  | "editor"
  | "terminal"
  | string;

export type ServicePriority = "critical" | "high" | "low";

export interface RegisteredService {
  id: ServiceId;
  /** Human-readable label */
  label: string;
  /** Disposal priority — "low" services are killed first in a panic */
  priority: ServicePriority;
  /** Estimated memory usage in MB (approximation for heuristics) */
  estimatedMemoryMB: number;
  /** Called to gracefully shut down the service */
  dispose: () => void | Promise<void>;
  /** Timestamp of registration */
  registeredAt: number;
}

export interface MemorySnapshot {
  /** Estimated total JS heap in MB (Chrome only, -1 if unavailable) */
  usedHeapMB: number;
  /** JS heap limit in MB (Chrome only, -1 if unavailable) */
  heapLimitMB: number;
  /** Static device memory hint in GB (navigator.deviceMemory) */
  deviceMemoryGB: number;
  /** Number of active registered services */
  activeServiceCount: number;
  /** Sum of estimated memory across all registered services */
  estimatedServiceMemoryMB: number;
}

// ── Controller ──────────────────────────────────────────────────────────────

export class SystemResourceController {
  private static instance: SystemResourceController | null = null;

  /** Get or create the singleton resource controller. */
  static getInstance(): SystemResourceController {
    if (!SystemResourceController.instance) {
      SystemResourceController.instance = new SystemResourceController();
    }
    return SystemResourceController.instance;
  }

  // ── State ─────────────────────────────────────────────────────────────
  private services = new Map<ServiceId, RegisteredService>();
  private panicListeners: Array<() => void> = [];

  private constructor() {
    // Listen for browser-level memory pressure if available
    this.setupMemoryPressureListener();
  }

  // ── Service Registration ──────────────────────────────────────────────

  /**
   * Register a heavy service. When `panic()` is called, all registered
   * services will be disposed in priority order (low → critical).
   *
   * Returns an unregister function.
   */
  register(service: Omit<RegisteredService, "registeredAt">): () => void {
    const full: RegisteredService = {
      ...service,
      registeredAt: Date.now(),
    };

    this.services.set(service.id, full);

    // Return unregister callback
    return () => {
      this.services.delete(service.id);
    };
  }

  /**
   * Unregister a service by ID (if you don't have the callback).
   */
  unregister(id: ServiceId): void {
    this.services.delete(id);
  }

  /**
   * Check if a service is currently registered/alive.
   */
  isAlive(id: ServiceId): boolean {
    return this.services.has(id);
  }

  /**
   * Get a snapshot of all registered services.
   */
  getServices(): RegisteredService[] {
    return Array.from(this.services.values());
  }

  // ── Disposal ──────────────────────────────────────────────────────────

  /**
   * Gracefully shut down a specific service.
   */
  async disposeService(id: ServiceId): Promise<void> {
    const service = this.services.get(id);
    if (!service) return;

    try {
      await service.dispose();
    } catch (err) {
      console.error(`[ResourceController] Error disposing ${id}:`, err);
    } finally {
      this.services.delete(id);
    }
  }

  /**
   * Gracefully shut down ALL services, in priority order:
   *   1. "low" priority first (terminal, editor)
   *   2. "high" priority next (webcontainer)
   *   3. "critical" last (AI worker)
   */
  async disposeAll(): Promise<void> {
    const ordered = this.getOrderedForDisposal();

    for (const service of ordered) {
      try {
        await service.dispose();
      } catch (err) {
        console.error(
          `[ResourceController] Error disposing ${service.id}:`,
          err
        );
      }
    }

    this.services.clear();
  }

  /**
   * 🚨 PANIC — Forcibly terminate ALL services immediately.
   *
   * Use when:
   *   - OOM detected
   *   - WebGPU device lost
   *   - Unrecoverable error
   *   - User manually triggers emergency cleanup
   *
   * This is SYNCHRONOUS where possible. Async dispose callbacks
   * are fire-and-forget (not awaited) during panic.
   */
  panic(): void {
    console.warn(
      "[ResourceController] 🚨 PANIC — force-disposing all services"
    );

    const ordered = this.getOrderedForDisposal();

    for (const service of ordered) {
      try {
        // Call dispose but don't await — we need to be fast
        const result = service.dispose();
        if (result instanceof Promise) {
          result.catch((err) =>
            console.error(
              `[ResourceController] Panic dispose error (${service.id}):`,
              err
            )
          );
        }
      } catch (err) {
        console.error(
          `[ResourceController] Panic dispose error (${service.id}):`,
          err
        );
      }
    }

    this.services.clear();

    // Notify panic listeners
    for (const listener of this.panicListeners) {
      try {
        listener();
      } catch {
        // swallow — we're in panic mode
      }
    }

    console.warn("[ResourceController] All services force-disposed.");
  }

  /**
   * Subscribe to panic events (e.g., to show an error screen).
   */
  onPanic(cb: () => void): () => void {
    this.panicListeners.push(cb);
    return () => {
      this.panicListeners = this.panicListeners.filter((l) => l !== cb);
    };
  }

  // ── Memory Diagnostics ────────────────────────────────────────────────

  /**
   * Get a snapshot of current memory usage.
   * Note: `performance.memory` is Chrome-only and non-standard.
   */
  getMemorySnapshot(): MemorySnapshot {
    const perf = (performance as unknown as Record<string, unknown>)
      .memory as
      | { usedJSHeapSize: number; jsHeapSizeLimit: number }
      | undefined;

    const usedHeapMB = perf
      ? Math.round(perf.usedJSHeapSize / 1024 / 1024)
      : -1;
    const heapLimitMB = perf
      ? Math.round(perf.jsHeapSizeLimit / 1024 / 1024)
      : -1;

    const deviceMemoryGB =
      (navigator as unknown as Record<string, number>).deviceMemory ?? -1;

    const services = this.getServices();
    const estimatedServiceMemoryMB = services.reduce(
      (sum, s) => sum + s.estimatedMemoryMB,
      0
    );

    return {
      usedHeapMB,
      heapLimitMB,
      deviceMemoryGB,
      activeServiceCount: services.length,
      estimatedServiceMemoryMB,
    };
  }

  /**
   * Check if the system is under memory pressure.
   * Heuristic: if used heap > 80% of limit, we're in trouble.
   */
  isUnderPressure(): boolean {
    const snap = this.getMemorySnapshot();
    if (snap.usedHeapMB === -1 || snap.heapLimitMB === -1) {
      // Can't determine — assume OK but warn
      return false;
    }
    return snap.usedHeapMB / snap.heapLimitMB > 0.8;
  }

  /**
   * Check if it's safe to launch a new heavy service.
   * Considers current heap usage + estimated cost of the new service.
   */
  canLaunch(estimatedMemoryMB: number): boolean {
    const snap = this.getMemorySnapshot();
    if (snap.heapLimitMB === -1) {
      // Can't determine — allow but warn
      console.warn(
        "[ResourceController] Cannot determine memory limits. Proceeding."
      );
      return true;
    }

    const projectedMB = snap.usedHeapMB + estimatedMemoryMB;
    const safeLimit = snap.heapLimitMB * 0.75; // 75% threshold
    return projectedMB < safeLimit;
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Sort services for disposal: low → high → critical
   */
  private getOrderedForDisposal(): RegisteredService[] {
    const priorityOrder: Record<ServicePriority, number> = {
      low: 0,
      high: 1,
      critical: 2,
    };

    return Array.from(this.services.values()).sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  /**
   * Set up memory pressure detection.
   * - Uses the `memory-pressure` Observer API if available (experimental)
   * - Falls back to periodic checks via performance.memory
   */
  private setupMemoryPressureListener(): void {
    // Periodic check (every 30s) — lightweight, Chrome-only
    if (typeof performance !== "undefined" && "memory" in performance) {
      setInterval(() => {
        if (this.isUnderPressure()) {
          console.warn(
            "[ResourceController] ⚠️ Memory pressure detected!",
            this.getMemorySnapshot()
          );
          // Auto-dispose low-priority services
          this.autoShed();
        }
      }, 30_000);
    }
  }

  /**
   * Auto-shed: dispose low-priority services when memory is high.
   * Only disposes "low" priority services to free up headroom.
   */
  private autoShed(): void {
    const lowPriority = Array.from(this.services.values()).filter(
      (s) => s.priority === "low"
    );

    for (const service of lowPriority) {
      console.warn(
        `[ResourceController] Auto-shedding low-priority service: ${service.id}`
      );
      try {
        const result = service.dispose();
        if (result instanceof Promise) {
          result.catch(() => {});
        }
      } catch {
        // swallow
      }
      this.services.delete(service.id);
    }
  }
}

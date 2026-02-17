/**
 * OPFS Write Queue — serialized async queue for OPFS writes.
 *
 * OPFS writes can be slow (encrypt → write to disk) and must not
 * block the UI or race against each other. This queue:
 *   1. Accepts write tasks and enqueues them.
 *   2. Drains tasks one-at-a-time in FIFO order.
 *   3. Coalesces writes to the same file path — if a newer write
 *      arrives while an older one is queued, the older one is dropped.
 *   4. Exposes a `flush()` method that resolves once the queue empties
 *      (useful before navigation or cleanup).
 */

export interface WriteTask {
  /** Unique key for coalescing — usually the relative file path. */
  key: string;
  /** The async work to perform. */
  execute: () => Promise<void>;
}

export class OPFSWriteQueue {
  private queue: WriteTask[] = [];
  private running = false;
  private flushResolvers: Array<() => void> = [];

  /**
   * Enqueue a write task. If a task with the same key is already
   * queued (but not yet executing), it is replaced with the newer one.
   */
  enqueue(task: WriteTask): void {
    // Coalesce: drop any older queued entry with the same key
    const idx = this.queue.findIndex((t) => t.key === task.key);
    if (idx !== -1) {
      this.queue[idx] = task;
    } else {
      this.queue.push(task);
    }

    if (!this.running) {
      this.drain();
    }
  }

  /**
   * Returns a promise that resolves when the queue is completely
   * drained (all pending tasks finished).
   */
  flush(): Promise<void> {
    if (this.queue.length === 0 && !this.running) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  /** Number of tasks waiting (excluding the one currently executing). */
  get pending(): number {
    return this.queue.length;
  }

  // ── Internal ──────────────────────────────────────────────

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task.execute();
      } catch (err) {
        console.error(`[OPFSWriteQueue] Task "${task.key}" failed:`, err);
      }
    }

    this.running = false;

    // Notify any flush() waiters
    for (const resolve of this.flushResolvers) {
      resolve();
    }
    this.flushResolvers = [];
  }
}

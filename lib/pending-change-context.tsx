"use client";

/**
 * PendingChangeContext — global review gate for AI-proposed file writes.
 *
 * Holds:
 *   pendingReview  — the finalized set of file actions awaiting user decision.
 *                    Set in onDone; cleared on Accept or Reject.
 *   pendingPaths   — Set<string> of paths currently under review, kept in sync
 *                    with pendingReview so the file-tree Sidebar can highlight them.
 *
 * Storing state here (not in ChatSidebar) means the Review overlay persists
 * even if the sidebar is toggled closed and re-opened.
 */

import type { FileAction } from "@/lib/ai-parser";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingReview {
  /** ID of the assistant message that produced these actions. */
  messageId: string;
  /** All file actions waiting to be committed. */
  actions: FileAction[];
}

interface PendingChangeContextValue {
  // ── Review gate ──────────────────────────────────────────────────────────
  /** Finalized review object; null when nothing is pending. */
  pendingReview: PendingReview | null;
  /** Set after the AI stream finishes and file actions are parsed. */
  setPendingReview: (review: PendingReview | null) => void;

  // ── Path highlights (for the file-tree Sidebar) ──────────────────────────
  /** Set of paths currently under review. */
  pendingPaths: Set<string>;
  /** Register a batch of file paths as pending review. */
  registerPendingPaths: (paths: string[]) => void;
  /** Remove all pending paths (call after accept or discard). */
  clearPendingPaths: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const PendingChangeContext =
  createContext<PendingChangeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function PendingChangeProvider({ children }: { children: ReactNode }) {
  const [pendingReview, setPendingReviewState] = useState<PendingReview | null>(
    null
  );
  const [pendingPaths, setPendingPaths] = useState<Set<string>>(new Set());

  const setPendingReview = useCallback(
    (review: PendingReview | null) => setPendingReviewState(review),
    []
  );

  const registerPendingPaths = useCallback((paths: string[]) => {
    setPendingPaths(new Set(paths));
  }, []);

  const clearPendingPaths = useCallback(() => {
    setPendingPaths(new Set());
  }, []);

  return (
    <PendingChangeContext.Provider
      value={{
        pendingReview,
        setPendingReview,
        pendingPaths,
        registerPendingPaths,
        clearPendingPaths,
      }}
    >
      {children}
    </PendingChangeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePendingPaths(): PendingChangeContextValue {
  const ctx = useContext(PendingChangeContext);
  if (!ctx) {
    throw new Error(
      "usePendingPaths must be called inside a <PendingChangeProvider>"
    );
  }
  return ctx;
}

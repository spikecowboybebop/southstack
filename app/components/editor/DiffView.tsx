"use client";

/**
 * DiffView — Accept / Reject UI for AI-generated file changes.
 *
 * Shows a simple unified-diff-style view with colored additions (+)
 * and deletions (-) so the user can review before applying changes.
 */

import type { FileAction } from "@/lib/ai-parser";
import { simpleDiff } from "@/lib/ai-parser";
import { Check, X } from "lucide-react";
import { useMemo, type FC } from "react";

// ─── Types ──────────────────────────────────────────────────

interface DiffViewProps {
  /** The file action proposed by the AI */
  action: FileAction;
  /** Current content of the file (empty string for new files) */
  currentContent: string;
  /** Called when the user accepts the change */
  onAccept: (action: FileAction) => void;
  /** Called when the user rejects the change */
  onReject: (action: FileAction) => void;
}

// ─── Component ──────────────────────────────────────────────

const DiffView: FC<DiffViewProps> = ({
  action,
  currentContent,
  onAccept,
  onReject,
}) => {
  const isNewFile = currentContent === "";

  const diffLines = useMemo(() => {
    if (isNewFile) {
      // For new files, show all lines as additions
      return action.content.split("\n").map((line) => ({
        type: "add" as const,
        text: line,
      }));
    }
    // Generate diff and parse into typed lines
    const raw = simpleDiff(currentContent, action.content, action.path);
    return raw.split("\n").map((line) => {
      if (line.startsWith("+ ")) return { type: "add" as const, text: line.slice(2) };
      if (line.startsWith("- ")) return { type: "del" as const, text: line.slice(2) };
      if (line.startsWith("@@ ")) return { type: "hunk" as const, text: line };
      if (line.startsWith("---") || line.startsWith("+++"))
        return { type: "header" as const, text: line };
      return { type: "ctx" as const, text: line.startsWith("  ") ? line.slice(2) : line };
    });
  }, [action, currentContent, isNewFile]);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-surface/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground">
            {action.path}
          </span>
          {isNewFile && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-400">
              New File
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAccept(action)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
            title="Accept changes"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
          <button
            onClick={() => onReject(action)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
            title="Reject changes"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
        </div>
      </div>

      {/* Diff body */}
      <div className="max-h-[300px] overflow-auto p-0">
        <pre className="text-[11px] leading-[1.6]">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={
                line.type === "add"
                  ? "bg-emerald-500/10 text-emerald-300 px-3"
                  : line.type === "del"
                    ? "bg-red-500/10 text-red-300 px-3"
                    : line.type === "hunk"
                      ? "bg-indigo/10 text-indigo-light px-3 py-0.5"
                      : line.type === "header"
                        ? "text-muted/60 px-3"
                        : "text-muted px-3"
              }
            >
              <span className="select-none text-muted/40 mr-2 inline-block w-3">
                {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};

export default DiffView;

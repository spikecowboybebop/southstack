/**
 * ai-parser.ts — Parse AI-generated responses for file operations.
 *
 * The AI agent uses a `FILE: <path>` marker followed by a fenced code
 * block to indicate file writes. This parser extracts those into a list
 * of { path, content } objects the caller can apply to the file system.
 *
 * Supported format:
 *
 *   FILE: src/App.jsx
 *   ```jsx
 *   import React from "react";
 *   export default function App() { return <h1>Hello</h1>; }
 *   ```
 *
 * Multiple FILE blocks can appear in a single response.
 * Any text outside FILE blocks is treated as plain chat and returned
 * as the `explanation` field.
 */

// ─── Types ──────────────────────────────────────────────────

export interface FileAction {
  /** Project-relative path, e.g. "src/App.jsx" */
  path: string;
  /** Full file content to write */
  content: string;
}

export interface ParsedResponse {
  /** Plain-text explanation (everything outside FILE blocks) */
  explanation: string;
  /** Ordered list of file write actions extracted from the response */
  actions: FileAction[];
}

// ─── Parser ─────────────────────────────────────────────────

/**
 * Parse an AI response string and extract file actions.
 *
 * Regex matches:
 *   FILE: <path>\n```<optional-lang>\n<content>\n```
 *
 * Everything not captured by the regex is concatenated as explanation text.
 */
export function parseAIResponse(raw: string): ParsedResponse {
  const actions: FileAction[] = [];

  // Match: FILE: <path>\n```<lang?>\n<content>\n```
  const FILE_BLOCK_RE =
    /FILE:\s*(.+?)\s*\n```[a-zA-Z]*\n([\s\S]*?)```/g;

  let explanation = raw;
  let match: RegExpExecArray | null;

  while ((match = FILE_BLOCK_RE.exec(raw)) !== null) {
    const path = match[1].trim();
    const content = match[2];

    // Remove trailing newline from content if present
    actions.push({
      path,
      content: content.endsWith("\n") ? content.slice(0, -1) : content,
    });

    // Strip the matched block from explanation
    explanation = explanation.replace(match[0], "");
  }

  // Clean up explanation: collapse multiple blank lines, trim
  explanation = explanation
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { explanation, actions };
}

/**
 * Generate a simple unified diff between two strings.
 * Used for the Accept/Reject UI.
 */
export function simpleDiff(
  oldContent: string,
  newContent: string,
  filename: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const lines: string[] = [
    `--- a/${filename}`,
    `+++ b/${filename}`,
  ];

  // Simple line-by-line diff (not optimized, but good enough for UI)
  const maxLen = Math.max(oldLines.length, newLines.length);
  let chunkStart = -1;
  let chunkOld: string[] = [];
  let chunkNew: string[] = [];

  function flushChunk() {
    if (chunkOld.length === 0 && chunkNew.length === 0) return;
    lines.push(
      `@@ -${chunkStart + 1},${chunkOld.length} +${chunkStart + 1},${chunkNew.length} @@`
    );
    for (const l of chunkOld) lines.push(`- ${l}`);
    for (const l of chunkNew) lines.push(`+ ${l}`);
    chunkOld = [];
    chunkNew = [];
    chunkStart = -1;
  }

  for (let i = 0; i < maxLen; i++) {
    const ol = i < oldLines.length ? oldLines[i] : undefined;
    const nl = i < newLines.length ? newLines[i] : undefined;

    if (ol === nl) {
      flushChunk();
      lines.push(`  ${ol ?? ""}`);
    } else {
      if (chunkStart === -1) chunkStart = i;
      if (ol !== undefined) chunkOld.push(ol);
      if (nl !== undefined) chunkNew.push(nl);
    }
  }
  flushChunk();

  return lines.join("\n");
}

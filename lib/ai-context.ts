/**
 * ai-context.ts — Gather project context for the AI coding agent.
 *
 * Builds a structured context string containing:
 *   1. The project's file tree (names only, no content)
 *   2. The content of the currently active file
 *
 * This context is prepended to the user's prompt so the LLM
 * understands the project architecture and can generate accurate
 * file paths and code.
 */

import { listTree, readFile, type FSNode } from "./opfs";

// ─── Types ──────────────────────────────────────────────────

export interface AIContext {
  /** Formatted context string ready to inject into the system prompt */
  systemContext: string;
  /** Number of files in the project */
  fileCount: number;
}

// ─── Helpers ────────────────────────────────────────────────

/** Recursively flatten the FSNode tree into indented path strings. */
function renderTree(nodes: FSNode[], indent = ""): string {
  let result = "";
  for (const node of nodes) {
    if (node.isDirectory) {
      result += `${indent}${node.name}/\n`;
      result += renderTree(node.children, indent + "  ");
    } else {
      result += `${indent}${node.name}\n`;
    }
  }
  return result;
}

/** Count total files (non-directory) in tree. */
function countFiles(nodes: FSNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.isDirectory) {
      count += countFiles(node.children);
    } else {
      count++;
    }
  }
  return count;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Gather the project context for the AI.
 *
 * @param userHash      - User's OPFS directory hash
 * @param projectId     - Current project ID
 * @param activePath    - Currently open file path (or null)
 * @param activeContent - Content of the currently open file
 * @param encryptionKey - Optional AES-GCM key for OPFS decryption
 */
export async function gatherContext(
  userHash: string,
  projectId: string,
  activePath: string | null,
  activeContent: string,
  encryptionKey?: CryptoKey
): Promise<AIContext> {
  // 1. Get the file tree
  const tree = await listTree(userHash, projectId);
  const treeStr = renderTree(tree);
  const fileCount = countFiles(tree);

  // 2. Build the context prompt
  const parts: string[] = [
    "You are a coding assistant embedded in an IDE called SouthStack.",
    "The user is working on a project with the following file structure:\n",
    "```",
    treeStr.trimEnd(),
    "```\n",
  ];

  if (activePath && activeContent) {
    parts.push(
      `The currently open file is \`${activePath}\`:\n`,
      "```",
      activeContent,
      "```\n"
    );
  }

  parts.push(
    "When you need to create or modify files, use this exact format:\n",
    "FILE: <relative-path>",
    "```<language>",
    "<full file content>",
    "```\n",
    "You may include multiple FILE blocks in a single response.",
    "Always provide the COMPLETE file content, not just the changed parts.",
    "Outside of FILE blocks, explain your changes in plain text."
  );

  return {
    systemContext: parts.join("\n"),
    fileCount,
  };
}

/**
 * Read and return the content of multiple files for extended context.
 * Useful when the AI needs to see more than just the active file.
 */
export async function readMultipleFiles(
  userHash: string,
  projectId: string,
  paths: string[],
  encryptionKey?: CryptoKey
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const reads = paths.map(async (path) => {
    try {
      const content = await readFile(userHash, projectId, path, encryptionKey);
      results.set(path, content);
    } catch {
      // File may not exist or be unreadable — skip silently
    }
  });
  await Promise.all(reads);
  return results;
}

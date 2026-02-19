/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FILE EXPLORER — Zustand Store  (src/store/fileExplorerStore.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages the virtual file tree that mirrors the WebContainer FS.
 *
 * FileNode is a recursive tree structure:
 *   { name: "src", type: "directory", children: [ { name: "index.ts", ... } ] }
 *
 * The store provides CRUD actions that:
 *   1. Mutate in-memory tree (instant UI update)
 *   2. Propagate changes to WebContainer FS (async, fire-and-forget)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { create } from "zustand";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  type: "file" | "directory";
  /** Absolute path from root, e.g. "/src/index.ts" */
  path: string;
  children?: FileNode[];
  /** Whether folder is expanded in the UI */
  expanded?: boolean;
}

export interface OpenTab {
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
}

export interface FileExplorerState {
  // ── Tree ──────────────────────────────────────────────────
  tree: FileNode[];
  /** Currently open file path */
  activeFilePath: string | null;
  /** Content of the active file in the editor */
  activeFileContent: string;
  /** Whether a rename is in progress */
  renamingPath: string | null;
  /** Open editor tabs */
  openTabs: OpenTab[];

  // ── Actions ───────────────────────────────────────────────
  setTree: (tree: FileNode[]) => void;
  setActiveFile: (path: string, content: string) => void;
  setActiveFileContent: (content: string) => void;
  toggleFolder: (path: string) => void;
  addNode: (parentPath: string, node: FileNode) => void;
  removeNode: (path: string) => void;
  renameNode: (oldPath: string, newName: string) => void;
  setRenamingPath: (path: string | null) => void;
  openTab: (path: string, name: string, language: string) => void;
  closeTab: (path: string) => void;
  setTabDirty: (path: string, isDirty: boolean) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively search the tree for a node at `targetPath` and apply `modifier`.
 * Returns a new tree array if a modification was made, or the original array if not found.
 */
function findAndModify(
  nodes: FileNode[],
  targetPath: string,
  modifier: (node: FileNode, parent: FileNode[], index: number) => FileNode[] | void
): FileNode[] {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].path === targetPath) {
      const result = modifier(nodes[i], nodes, i);
      return result ?? [...nodes];
    }
    if (nodes[i].children) {
      const newChildren = findAndModify(nodes[i].children!, targetPath, modifier);
      if (newChildren !== nodes[i].children) {
        const updated = [...nodes];
        updated[i] = { ...nodes[i], children: newChildren };
        return updated;
      }
    }
  }
  return nodes;
}

/** Insert a child node into the correct parent directory, creating sorted order. Root-level add if parentPath is "/". */
function addChildToParent(nodes: FileNode[], parentPath: string, child: FileNode): FileNode[] {
  // Root-level add
  if (parentPath === "/" || parentPath === "") {
    return sortNodes([...nodes, child]);
  }

  return nodes.map((node) => {
    if (node.path === parentPath && node.type === "directory") {
      return {
        ...node,
        expanded: true,
        children: sortNodes([...(node.children ?? []), child]),
      };
    }
    if (node.children) {
      const newChildren = addChildToParent(node.children, parentPath, child);
      if (newChildren !== node.children) {
        return { ...node, children: newChildren };
      }
    }
    return node;
  });
}

/** Remove a node (and all descendants) from the tree by path. */
function removeFromTree(nodes: FileNode[], targetPath: string): FileNode[] {
  return nodes
    .filter((n) => n.path !== targetPath)
    .map((n) => {
      if (n.children) {
        return { ...n, children: removeFromTree(n.children, targetPath) };
      }
      return n;
    });
}

/** Sort: folders first, then alphabetically */
function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Recursively update all descendant paths after a parent rename. */
function updatePathsRecursively(node: FileNode, newParentPath: string): FileNode {
  const newPath = newParentPath === "/" ? `/${node.name}` : `${newParentPath}/${node.name}`;
  return {
    ...node,
    path: newPath,
    children: node.children?.map((c) => updatePathsRecursively(c, newPath)),
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useFileExplorerStore = create<FileExplorerState>((set) => ({
  tree: [],
  activeFilePath: null,
  activeFileContent: "",
  renamingPath: null,
  openTabs: [],

  /** Replace the entire tree (e.g. after initial load from WebContainer). */
  setTree: (tree) => set({ tree: sortNodes(tree) }),

  /** Set the currently open file path and its content for the editor. */
  setActiveFile: (path, content) =>
    set({ activeFilePath: path, activeFileContent: content }),

  /** Update only the content of the active file (on editor keystrokes). */
  setActiveFileContent: (content) => set({ activeFileContent: content }),

  /** Toggle a folder's expanded/collapsed state in the tree. */
  toggleFolder: (path) =>
    set((state) => ({
      tree: findAndModify(state.tree, path, (node, parent, index) => {
        const updated = [...parent];
        updated[index] = { ...node, expanded: !node.expanded };
        return updated;
      }),
    })),

  /** Add a new file/folder node under the given parent path. */
  addNode: (parentPath, node) =>
    set((state) => ({
      tree: addChildToParent(state.tree, parentPath, node),
    })),

  /** Remove a node by path. Clears active file if it was the deleted one. */
  removeNode: (path) =>
    set((state) => ({
      tree: removeFromTree(state.tree, path),
      // If the deleted file was active, clear the editor
      activeFilePath: state.activeFilePath === path ? null : state.activeFilePath,
      activeFileContent: state.activeFilePath === path ? "" : state.activeFileContent,
    })),

  /** Rename a node: update name, path, and all descendant paths. */
  renameNode: (oldPath, newName) =>
    set((state) => {
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/")) || "/";
      const newPath = parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;

      const newTree = findAndModify(state.tree, oldPath, (node, parent, index) => {
        const updated = [...parent];
        const renamedNode: FileNode = {
          ...node,
          name: newName,
          path: newPath,
          children: node.children?.map((c) => updatePathsRecursively(c, newPath)),
        };
        updated[index] = renamedNode;
        return sortNodes(updated);
      });

      return {
        tree: newTree,
        activeFilePath: state.activeFilePath === oldPath ? newPath : state.activeFilePath,
        renamingPath: null,
      };
    }),

  /** Set which node is currently being renamed (null = none). */
  setRenamingPath: (path) => set({ renamingPath: path }),

  /** Open a new tab (or activate existing one). */
  openTab: (path, name, language) =>
    set((state) => {
      const exists = state.openTabs.find((t) => t.path === path);
      if (exists) {
        return { activeFilePath: path };
      }
      return {
        openTabs: [...state.openTabs, { path, name, language, isDirty: false }],
        activeFilePath: path,
      };
    }),

  /** Close a tab. Activates the nearest remaining tab. */
  closeTab: (path) =>
    set((state) => {
      const idx = state.openTabs.findIndex((t) => t.path === path);
      const newTabs = state.openTabs.filter((t) => t.path !== path);
      let newActive = state.activeFilePath;
      if (state.activeFilePath === path) {
        if (newTabs.length === 0) {
          newActive = null;
        } else if (idx >= newTabs.length) {
          newActive = newTabs[newTabs.length - 1].path;
        } else {
          newActive = newTabs[idx].path;
        }
      }
      return {
        openTabs: newTabs,
        activeFilePath: newActive,
        activeFileContent: newActive === null ? "" : state.activeFileContent,
      };
    }),

  /** Mark a tab as dirty (unsaved changes). */
  setTabDirty: (path, isDirty) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.path === path ? { ...t, isDirty } : t
      ),
    })),
}));

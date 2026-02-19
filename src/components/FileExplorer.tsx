/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FILE EXPLORER COMPONENT  (src/components/FileExplorer.tsx)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * VS Code-style file tree sidebar with:
 *   • Expand/collapse folders
 *   • Language-based file icons (auto-detected from extension)
 *   • Create file / Create folder (inline input)
 *   • Rename (inline input, pressing F2 or context button)
 *   • Delete (with confirmation)
 *   • Click to open file in Monaco editor
 *   • Syncs with WebContainer virtual filesystem
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useFileExplorerStore, type FileNode } from "../store/fileExplorerStore";
import { WebContainerManager } from "../webcontainer/manager";
import {
  getFileIcon,
  getLanguageFromFilename,
  FOLDER_ICON,
  FOLDER_OPEN_ICON,
} from "../utils/fileIcons";

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface FileExplorerProps {
  /** Called when a file is opened so App can update the editor */
  onFileOpen: (path: string, content: string, language: string) => void;
}

/** Root file explorer sidebar. Loads the tree from WebContainer and provides create/rename/delete actions. */
export default function FileExplorer({ onFileOpen }: FileExplorerProps) {
  const { tree, activeFilePath, renamingPath, setTree, setRenamingPath } =
    useFileExplorerStore();

  const [creating, setCreating] = useState<{
    parentPath: string;
    type: "file" | "directory";
  } | null>(null);

  // ── Load tree from WebContainer on mount ──────────────────────────────
  useEffect(() => {
    const mgr = WebContainerManager.getInstance();

    const loadTree = async () => {
      try {
        const nodes = await mgr.readTree("/");
        setTree(nodes);
      } catch {
        // WebContainer not booted yet — will reload after boot
      }
    };

    loadTree();

    // Reload tree whenever FS changes
    const unsub = mgr.onFSChange(() => {
      loadTree();
    });

    return unsub;
  }, [setTree]);

  // ── Create new item (file or folder) ──────────────────────────────────
  /** Begin inline creation flow at a given parent path. */
  const handleCreateStart = useCallback(
    (type: "file" | "directory", parentPath: string = "/") => {
      setCreating({ parentPath, type });
    },
    []
  );

  /** Finalize creation: write file/dir to WebContainer FS. Tree auto-refreshes via onFSChange. */
  const handleCreateConfirm = useCallback(
    async (name: string) => {
      if (!creating || !name.trim()) {
        setCreating(null);
        return;
      }
      const mgr = WebContainerManager.getInstance();
      const parentPath = creating.parentPath;
      const fullPath =
        parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;

      try {
        if (creating.type === "directory") {
          await mgr.createDir(fullPath);
        } else {
          await mgr.createFile(fullPath, "");
        }
        // Tree auto-refreshes via onFSChange
      } catch (err) {
        console.error("Failed to create:", err);
      }

      setCreating(null);
    },
    [creating]
  );

  /** Cancel inline creation and reset state. */
  const handleCreateCancel = useCallback(() => {
    setCreating(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="file-explorer">
      {/* Header with actions */}
      <div className="fe-header">
        <span className="fe-title">EXPLORER</span>
        <div className="fe-actions">
          <button
            className="fe-action-btn"
            title="New File"
            onClick={() => handleCreateStart("file")}
          >
            📄+
          </button>
          <button
            className="fe-action-btn"
            title="New Folder"
            onClick={() => handleCreateStart("directory")}
          >
            📁+
          </button>
        </div>
      </div>

      {/* File tree */}
      <div className="fe-tree">
        {tree.length === 0 && (
          <div className="fe-empty">No files yet. Create one above ↑</div>
        )}
        {tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            renamingPath={renamingPath}
            onFileOpen={onFileOpen}
            onCreateStart={handleCreateStart}
            setRenamingPath={setRenamingPath}
          />
        ))}

        {/* Inline create at root level */}
        {creating && creating.parentPath === "/" && (
          <InlineInput
            depth={0}
            type={creating.type}
            onConfirm={handleCreateConfirm}
            onCancel={handleCreateCancel}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE TREE NODE (recursive)
// ═══════════════════════════════════════════════════════════════════════════════

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  activeFilePath: string | null;
  renamingPath: string | null;
  onFileOpen: (path: string, content: string, language: string) => void;
  onCreateStart: (type: "file" | "directory", parentPath: string) => void;
  setRenamingPath: (path: string | null) => void;
}

/** Recursive tree node — renders a single file/folder row with context actions and children. */
function FileTreeNode({
  node,
  depth,
  activeFilePath,
  renamingPath,
  onFileOpen,
  onCreateStart,
  setRenamingPath,
}: FileTreeNodeProps) {
  const {
    toggleFolder,
    removeNode,
    renameNode,
  } = useFileExplorerStore();

  const [showContext, setShowContext] = useState(false);
  const [creating, setCreating] = useState<"file" | "directory" | null>(null);
  const isActive = activeFilePath === node.path;
  const isRenaming = renamingPath === node.path;
  const isDir = node.type === "directory";

  // ── Click handlers ─────────────────────────────────────────────────────

  /** Toggle folder expansion or read file content and open in editor. */
  const handleClick = useCallback(async () => {
    if (isDir) {
      toggleFolder(node.path);
    } else {
      try {
        const mgr = WebContainerManager.getInstance();
        const content = await mgr.readFile(node.path);
        const language = getLanguageFromFilename(node.name);
        onFileOpen(node.path, content, language);
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  }, [isDir, node.path, node.name, toggleFolder, onFileOpen]);

  // ── Delete ─────────────────────────────────────────────────────────────
  /** Confirm-then-delete a file or directory from WebContainer FS and the Zustand tree. */  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowContext(false);
      const confirmMsg = isDir
        ? `Delete folder "${node.name}" and all contents?`
        : `Delete "${node.name}"?`;
      if (!confirm(confirmMsg)) return;

      const mgr = WebContainerManager.getInstance();
      try {
        if (isDir) {
          await mgr.deleteDir(node.path);
        } else {
          await mgr.deleteFile(node.path);
        }
        removeNode(node.path);
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [isDir, node.name, node.path, removeNode]
  );

  // ── Rename ─────────────────────────────────────────────────────────────
  /** Enter rename mode for this node. */
  const handleRenameStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowContext(false);
      setRenamingPath(node.path);
    },
    [node.path, setRenamingPath]
  );

  /** Apply the new name: rename in WebContainer FS and update the Zustand tree. */
  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!newName.trim() || newName === node.name) {
        setRenamingPath(null);
        return;
      }
      const parentPath =
        node.path.substring(0, node.path.lastIndexOf("/")) || "/";
      const newPath =
        parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;

      const mgr = WebContainerManager.getInstance();
      try {
        await mgr.rename(node.path, newPath);
        renameNode(node.path, newName);
      } catch (err) {
        console.error("Rename failed:", err);
        setRenamingPath(null);
      }
    },
    [node.path, node.name, renameNode, setRenamingPath]
  );

  // ── Context menu toggle ────────────────────────────────────────────────

  /** Toggle the three-dot context dropdown for this node. */
  const handleContextToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowContext((v) => !v);
    },
    []
  );

  // ── Create inside folder ───────────────────────────────────────────────

  /** Start inline creation of a file/folder inside this directory. Expands the folder if collapsed. */
  const handleCreateInside = useCallback(
    (type: "file" | "directory", e: React.MouseEvent) => {
      e.stopPropagation();
      setShowContext(false);
      setCreating(type);
      // Also expand the folder if collapsed
      if (!node.expanded) toggleFolder(node.path);
    },
    [node.expanded, node.path, toggleFolder]
  );

  /** Commit inline creation within this folder to the WebContainer FS. */
  const handleCreateConfirm = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        setCreating(null);
        return;
      }
      const fullPath = `${node.path}/${name}`;
      const mgr = WebContainerManager.getInstance();
      try {
        if (creating === "directory") {
          await mgr.createDir(fullPath);
        } else {
          await mgr.createFile(fullPath, "");
        }
      } catch (err) {
        console.error("Failed to create:", err);
      }
      setCreating(null);
    },
    [node.path, creating]
  );

  // ── Icon ───────────────────────────────────────────────────────────────

  const icon = isDir
    ? node.expanded
      ? FOLDER_OPEN_ICON
      : FOLDER_ICON
    : getFileIcon(node.name);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className={`fe-node ${isActive ? "fe-node-active" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={() => isDir || handleClick()}
      >
        {/* Expand/collapse arrow for dirs */}
        {isDir && (
          <span className="fe-arrow">{node.expanded ? "▾" : "▸"}</span>
        )}
        {!isDir && <span className="fe-arrow-spacer" />}

        {/* File icon badge */}
        <span
          className="fe-icon"
          style={{ backgroundColor: icon.bgColor, color: icon.color }}
          title={node.name}
        >
          {icon.label}
        </span>

        {/* Name — or inline rename input */}
        {isRenaming ? (
          <InlineRenameInput
            defaultValue={node.name}
            onConfirm={handleRenameConfirm}
            onCancel={() => setRenamingPath(null)}
          />
        ) : (
          <span className="fe-name" title={node.path}>
            {node.name}
          </span>
        )}

        {/* Context actions (visible on hover) */}
        {!isRenaming && (
          <span className="fe-context-trigger" onClick={handleContextToggle}>
            ⋯
          </span>
        )}

        {/* Dropdown context menu */}
        {showContext && (
          <div className="fe-context-menu" onClick={(e) => e.stopPropagation()}>
            {isDir && (
              <>
                <button
                  className="fe-ctx-btn"
                  onClick={(e) => handleCreateInside("file", e)}
                >
                  📄 New File
                </button>
                <button
                  className="fe-ctx-btn"
                  onClick={(e) => handleCreateInside("directory", e)}
                >
                  📁 New Folder
                </button>
                <div className="fe-ctx-divider" />
              </>
            )}
            <button className="fe-ctx-btn" onClick={handleRenameStart}>
              ✏️ Rename
            </button>
            <button className="fe-ctx-btn fe-ctx-danger" onClick={handleDelete}>
              🗑️ Delete
            </button>
          </div>
        )}
      </div>

      {/* Children (if folder is expanded) */}
      {isDir && node.expanded && node.children && (
        <>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              renamingPath={renamingPath}
              onFileOpen={onFileOpen}
              onCreateStart={onCreateStart}
              setRenamingPath={setRenamingPath}
            />
          ))}
          {/* Inline create inside this folder */}
          {creating && (
            <InlineInput
              depth={depth + 1}
              type={creating}
              onConfirm={handleCreateConfirm}
              onCancel={() => setCreating(null)}
            />
          )}
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE INPUT — for creating new files/folders
// ═══════════════════════════════════════════════════════════════════════════════

interface InlineInputProps {
  depth: number;
  type: "file" | "directory";
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/** Inline text input shown when creating a new file or folder. Auto-focuses on mount. */
function InlineInput({ depth, type, onConfirm, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onConfirm(value);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const placeholder =
    type === "file" ? "filename.ext" : "folder-name";

  return (
    <div
      className="fe-node fe-node-creating"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="fe-arrow-spacer" />
      <span
        className="fe-icon"
        style={{
          backgroundColor: type === "file" ? "#94a3b822" : "#e8a87c22",
          color: type === "file" ? "#94a3b8" : "#e8a87c",
        }}
      >
        {type === "file" ? "NEW" : "📁"}
      </span>
      <input
        ref={inputRef}
        className="fe-inline-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (value.trim()) onConfirm(value);
          else onCancel();
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE RENAME INPUT
// ═══════════════════════════════════════════════════════════════════════════════

interface InlineRenameInputProps {
  defaultValue: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

/** Inline text input for renaming. Pre-selects the filename (without extension) on mount. */
function InlineRenameInput({
  defaultValue,
  onConfirm,
  onCancel,
}: InlineRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      // Select filename without extension
      const dotIndex = defaultValue.lastIndexOf(".");
      input.setSelectionRange(0, dotIndex > 0 ? dotIndex : defaultValue.length);
    }
  }, [defaultValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      onConfirm(value);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="fe-inline-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onConfirm(value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

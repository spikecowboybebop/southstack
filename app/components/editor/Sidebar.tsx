"use client";

import {
    deleteEntry,
    listTree,
    createDirectory as opfsCreateDir,
    createFile as opfsCreateFile,
    type FSNode,
} from "@/lib/opfs";
import { usePendingPaths } from "@/lib/pending-change-context";
import {
    ChevronDown,
    ChevronRight,
    File,
    FileClock,
    FilePlus,
    Folder,
    FolderOpen,
    FolderPlus,
    PanelLeftClose,
    PanelLeftOpen,
    Trash2,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";

// ─── File / Language icon mapping ────────────────────────────

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const colourMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    py: "text-green-400",
    html: "text-orange-400",
    css: "text-pink-400",
    scss: "text-pink-400",
    json: "text-amber-400",
    md: "text-gray-400",
    yaml: "text-red-400",
    yml: "text-red-400",
    svg: "text-emerald-400",
  };
  return colourMap[ext ?? ""] ?? "text-muted";
}

// ─── Props ───────────────────────────────────────────────────

interface SidebarProps {
  projectId: string;
  projectName: string;
  activePath: string | null;
  onFileSelect: (path: string) => void;
  /** External trigger: bump to re-read the tree */
  refreshKey?: number;
  /** SHA-256 hash of the username — scopes OPFS storage. */
  userHash: string;
  /** AES-GCM key for encrypting file content. */
  encryptionKey?: CryptoKey;
  /** Called after a new file is created in OPFS (path, content). */
  onFileCreated?: (path: string, content: string) => void;
  /** Called after a new folder is created in OPFS. */
  onFolderCreated?: (path: string) => void;
  /** Called after a file or folder is deleted from OPFS. */
  onEntryDeleted?: (path: string) => void;
}

// ─── Component ──────────────────────────────────────────────

export default function Sidebar({
  projectId,
  projectName,
  activePath,
  onFileSelect,
  refreshKey,
  userHash,
  encryptionKey,
  onFileCreated,
  onFolderCreated,
  onEntryDeleted,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tree, setTree] = useState<FSNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { pendingPaths } = usePendingPaths();

  // "Inline rename / new" state
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntryParent, setNewEntryParent] = useState<string | null>(null);
  const [newEntryKind, setNewEntryKind] = useState<"file" | "folder">("file");
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load tree ──
  const loadTree = useCallback(async () => {
    try {
      const nodes = await listTree(userHash, projectId);
      setTree(nodes);
    } catch (err) {
      console.error("Failed to read file tree:", err);
    } finally {
      setLoading(false);
    }
  }, [userHash, projectId]);

  useEffect(() => {
    loadTree();
  }, [loadTree, refreshKey]);

  // ── Toggle folder expansion ──
  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  // Auto-focus the input when it becomes visible
  useEffect(() => {
    if (showNewEntry) {
      // Wait a tick for the DOM node to mount
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [showNewEntry]);

  // ── New file / folder inline ──
  function startNewEntry(parentPath: string | null, kind: "file" | "folder") {
    setNewEntryParent(parentPath);
    setNewEntryKind(kind);
    setShowNewEntry(true);
    // Ensure parent is expanded
    if (parentPath) setExpanded((p) => new Set(p).add(parentPath));
  }

  function hideNewEntry() {
    setShowNewEntry(false);
    setNewEntryParent(null);
  }

  async function commitNewEntry(name: string) {
    if (!name.trim()) {
      hideNewEntry();
      return;
    }
    const fullPath = newEntryParent ? `${newEntryParent}/${name}` : name;
    try {
      if (newEntryKind === "file") {
        await opfsCreateFile(userHash, projectId, fullPath, "", encryptionKey);
        onFileSelect(fullPath);
        onFileCreated?.(fullPath, "");
      } else {
        await opfsCreateDir(userHash, projectId, fullPath);
        setExpanded((p) => new Set(p).add(fullPath));
        onFolderCreated?.(fullPath);
      }
      await loadTree();
    } catch (err) {
      console.error("Failed to create entry:", err);
    }
    hideNewEntry();
  }

  function handleInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      commitNewEntry((e.target as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      hideNewEntry();
    }
  }

  // ── Delete ──
  async function handleDelete(path: string) {
    try {
      await deleteEntry(userHash, projectId, path);
      onEntryDeleted?.(path);
      await loadTree();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  // ── Render tree recursively ──
  function renderNode(node: FSNode, depth: number) {
    const isExpanded = expanded.has(node.path);
    const isActive = node.path === activePath;
    const indent = depth * 16;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <div
            className={`group flex items-center gap-1.5 cursor-pointer py-[3px] pr-2 text-[13px] hover:bg-white/5 transition-colors ${
              isActive ? "bg-indigo/10 text-indigo-light" : "text-muted"
            }`}
            style={{ paddingLeft: indent + 8 }}
            onClick={() => toggleExpand(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted/60" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-indigo/70" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-indigo/70" />
            )}
            <span className="truncate">{node.name}</span>

            {/* Hover actions */}
            <div className="ml-auto hidden items-center gap-0.5 group-hover:flex">
              <button
                title="New file"
                className="rounded p-0.5 hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  startNewEntry(node.path, "file");
                }}
              >
                <FilePlus className="h-3 w-3" />
              </button>
              <button
                title="New folder"
                className="rounded p-0.5 hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  startNewEntry(node.path, "folder");
                }}
              >
                <FolderPlus className="h-3 w-3" />
              </button>
              <button
                title="Delete"
                className="rounded p-0.5 hover:bg-red-500/20 text-red-400/60 hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(node.path);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Children */}
          {isExpanded && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
              {/* Inline input for new entry inside this folder */}
              {showNewEntry && newEntryParent === node.path && renderInlineInput(depth + 1)}
            </div>
          )}
        </div>
      );
    }

    // File node
    const isPending = pendingPaths.has(node.path);
    return (
      <div
        key={node.path}
        className={`group flex items-center gap-1.5 cursor-pointer py-[3px] pr-2 text-[13px] transition-colors ${
          isActive
            ? "bg-indigo/10 text-foreground"
            : isPending
              ? "bg-amber-500/5 text-amber-300/90 hover:bg-amber-500/10"
              : "text-muted hover:bg-white/5 hover:text-foreground/80"
        }`}
        style={{ paddingLeft: indent + 8 }}
        onClick={() => onFileSelect(node.path)}
      >
        <span className="w-3.5" /> {/* spacer for chevron alignment */}
        {isPending ? (
          <FileClock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        ) : (
          <File className={`h-3.5 w-3.5 shrink-0 ${fileIcon(node.name)}`} />
        )}
        <span className="truncate">{node.name}</span>
        {isPending && (
          <span className="ml-1 shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[8px] font-medium text-amber-400">
            pending
          </span>
        )}

        <div className="ml-auto hidden items-center gap-0.5 group-hover:flex">
          <button
            title="Delete"
            className="rounded p-0.5 hover:bg-red-500/20 text-red-400/60 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(node.path);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  function renderInlineInput(depth: number) {
    const indent = depth * 16;
    return (
      <div
        className="flex items-center gap-1.5 py-[3px] pr-2"
        style={{ paddingLeft: indent + 8 }}
      >
        <span className="w-3.5" />
        {newEntryKind === "folder" ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-indigo/70" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted" />
        )}
        <input
          ref={inputRef}
          className="flex-1 rounded border border-indigo/40 bg-surface-light px-1.5 py-0.5 text-[12px] text-foreground outline-none placeholder-muted/40"
          placeholder={newEntryKind === "file" ? "filename.ts" : "folder-name"}
          onKeyDown={handleInputKey}
          onBlur={(e) => commitNewEntry(e.target.value)}
        />
      </div>
    );
  }

  // ── Collapsed state ──
  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-border bg-surface pt-2">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Full sidebar ──
  return (
    <div className="flex w-[250px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-[12px] font-semibold uppercase tracking-wider text-muted">
          {projectName}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => startNewEntry(null, "file")}
            className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            title="New file"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => startNewEntry(null, "folder")}
            className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="space-y-1 px-3 pt-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-white/5"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        ) : tree.length === 0 && !showNewEntry ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <Folder className="h-8 w-8 text-muted/20" />
            <p className="text-[12px] text-muted/50">No files yet</p>
            <button
              onClick={() => startNewEntry(null, "file")}
              className="rounded-md bg-indigo/10 px-3 py-1.5 text-[12px] text-indigo transition-colors hover:bg-indigo/20"
            >
              Create a file
            </button>
          </div>
        ) : (
          <>
            {tree.map((node) => renderNode(node, 0))}
            {/* Root-level inline input */}
            {showNewEntry && newEntryParent === null && renderInlineInput(0)}
          </>
        )}
      </div>
    </div>
  );
}

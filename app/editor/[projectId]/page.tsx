"use client";

/**
 * /editor/[projectId] — Full-fledged Code Editor.
 *
 * Uses Monaco Editor, OPFS-backed file tree, collapsible sidebar,
 * tabs, and manual save (Ctrl+S).
 */

import {
  detectLanguage,
  listTree,
  readFile,
  writeFile,
} from "@/lib/opfs";
import { OPFSWriteQueue } from "@/lib/opfs-write-queue";
import { getProject, type Project } from "@/lib/projects";
import {
  initializeProject,
  readPackageScripts,
  rehydrateProject,
  spawnNpmScript,
  switchProject,
  syncDeleteInContainer,
  syncDirToContainer,
  syncFileToContainer,
  teardownProject,
  useWebContainer,
  type RehydrationPhase
} from "@/lib/useWebContainer";
import { injectHeaderConfig } from "@/lib/wc-server-headers";
import { WCSyncManager } from "@/lib/wc-sync-manager";
import { useAuth } from "../../components/AuthProvider";
import Sidebar from "../../components/editor/Sidebar";
import TabBar, { type TabItem } from "../../components/editor/TabBar";

import { AIProvider } from "@/lib/ai-engine";
import type { FileAction } from "@/lib/ai-parser";
import { PendingChangeProvider } from "@/lib/pending-change-context";
import type { Monaco } from "@monaco-editor/react";
import type { WebContainerProcess } from "@webcontainer/api";
import {
  ArrowLeft,
  Bot,
  Code2,
  FileCode,
  Loader2,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Save,
  Square,
  Terminal,
  WifiOff,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import type { WebTerminalHandle } from "../../components/editor/WebTerminal";

// ─── Custom Monaco Theme ────────────────────────────────────

function handleBeforeMount(monaco: Monaco) {
  monaco.editor.defineTheme("brand-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      // Strings → emerald green
      { token: "string", foreground: "34d399" },
      { token: "string.escape", foreground: "6ee7b7" },
      // Keywords → soft pink
      { token: "keyword", foreground: "f9a8d4" },
      { token: "keyword.control", foreground: "f9a8d4" },
      // Functions → electric blue
      { token: "function", foreground: "60a5fa" },
      { token: "entity.name.function", foreground: "60a5fa" },
      { token: "support.function", foreground: "60a5fa" },
      // Types → warm amber
      { token: "type", foreground: "fbbf24" },
      { token: "type.identifier", foreground: "fbbf24" },
      // Numbers → orange
      { token: "number", foreground: "fb923c" },
      { token: "number.hex", foreground: "fb923c" },
      // Comments → cool grey
      { token: "comment", foreground: "4b5563", fontStyle: "italic" },
      // Variables / identifiers
      { token: "variable", foreground: "c4b5fd" },
      { token: "variable.predefined", foreground: "c4b5fd" },
      // Operators
      { token: "operator", foreground: "f472b6" },
      { token: "delimiter", foreground: "6b7280" },
      // Tags (HTML/JSX)
      { token: "tag", foreground: "f87171" },
      { token: "attribute.name", foreground: "fbbf24" },
      { token: "attribute.value", foreground: "34d399" },
      // Regex
      { token: "regexp", foreground: "fca5a5" },
    ],
    colors: {
      // Editor background
      "editor.background": "#0B0E14",
      // Line highlight — brand indigo tint
      "editor.lineHighlightBackground": "#6366f10d",
      "editor.lineHighlightBorder": "#6366f11a",
      // Selection — brand indigo
      "editor.selectionBackground": "#6366f133",
      "editor.inactiveSelectionBackground": "#6366f11a",
      "editor.selectionHighlightBackground": "#6366f11a",
      // Cursor
      "editorCursor.foreground": "#818cf8",
      // Gutter
      "editorLineNumber.foreground": "#3f3f46",
      "editorLineNumber.activeForeground": "#818cf8",
      // Widget / suggest
      "editorWidget.background": "#0f1219",
      "editorWidget.border": "#1e1e2e",
      "editorSuggestWidget.background": "#0f1219",
      "editorSuggestWidget.selectedBackground": "#6366f126",
      // Bracket match
      "editorBracketMatch.background": "#6366f11a",
      "editorBracketMatch.border": "#6366f14d",
      // Indent guides
      "editorIndentGuide.background": "#1e1e2e",
      "editorIndentGuide.activeBackground": "#6366f14d",
      // Scrollbar
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#6366f11a",
      "scrollbarSlider.hoverBackground": "#6366f133",
      "scrollbarSlider.activeBackground": "#6366f14d",
    },
  });
}

// Dynamically load Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-indigo" />
    </div>
  ),
});

// Dynamically load WebTerminal (depends on xterm which is browser-only)
const WebTerminal = dynamic(
  () => import("../../components/editor/WebTerminal"),
  { ssr: false }
);

// Dynamically load PreviewPane (iframe-based preview)
const PreviewPane = dynamic(
  () => import("../../components/editor/PreviewPane"),
  { ssr: false }
);

// Dynamically load ChatSidebar (AI chat panel)
const ChatSidebar = dynamic(
  () => import("../../components/editor/ChatSidebar"),
  { ssr: false }
);

// ─── Page ───────────────────────────────────────────────────

const EditorProjectPage: FC = () => {
  const { user, userHash, encryptionKey, isLoggedIn, mounted, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  // WebContainer
  const { instance: wc, isBooting: wcBooting } = useWebContainer();
  const [wcMounted, setWcMounted] = useState(false);

  // Project meta from IndexedDB
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // File / editor state
  const [activePath, setActivePath] = useState<string | null>(null);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [fileContent, setFileContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [refreshTree, setRefreshTree] = useState(0);
  const [availableScripts, setAvailableScripts] = useState<string[]>([]);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [serverProcessId, setServerProcessId] = useState<string | null>(null);
  const [isStartingServer, setIsStartingServer] = useState(false);

  // Multi-port preview: tracks every active server port + URL
  interface ActivePort {
    port: number;
    url: string;
    readyAt: number; // timestamp for ordering
  }
  const [activePorts, setActivePorts] = useState<ActivePort[]>([]);
  const [showPreviewPane, setShowPreviewPane] = useState(false); // iframe preview panel
  const [showAIChat, setShowAIChat] = useState(false); // AI chat sidebar

  // ── Resizable split pane ──
  const [splitPercent, setSplitPercent] = useState(50); // editor width as % of container
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const activePathRef = useRef<string | null>(null);
  const serverProcessRef = useRef<WebContainerProcess | null>(null);
  const isFlushing = useRef(false);

  // Project init & sync manager
  const [rehydrationPhase, setRehydrationPhase] = useState<RehydrationPhase | null>(null);
  const terminalRef = useRef<WebTerminalHandle>(null);
  const syncManagerRef = useRef<WCSyncManager | null>(null);
  const writeQueue = useMemo(() => new OPFSWriteQueue(), []);
  const mountedProjectRef = useRef<string | null>(null);

  // Keep ref in sync for the save callback closure
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // ── Route guard ──
  useEffect(() => {
    if (mounted && !isLoggedIn) router.replace("/login");
  }, [mounted, isLoggedIn, router]);

  // ── Listen for servers becoming ready (Express/Vite/etc.) ──
  // Supports multiple ports: each `server-ready` event adds to the list.
  useEffect(() => {
    if (!wc) return;

    // Fires when a server starts listening on a port
    const unsubReady = wc.on("server-ready", (port: number, url: string) => {
      setActivePorts((prev) => {
        // Replace if this port already exists, otherwise append
        const filtered = prev.filter((p) => p.port !== port);
        return [...filtered, { port, url, readyAt: Date.now() }].sort(
          (a, b) => a.port - b.port
        );
      });
      setIsStartingServer(false);
    });

    // Fires when a port is opened or closed
    const unsubPort = wc.on("port", (port: number, type: "open" | "close") => {
      if (type === "close") {
        setActivePorts((prev) => prev.filter((p) => p.port !== port));
      }
    });

    return () => {
      if (typeof unsubReady === "function") unsubReady();
      if (typeof unsubPort === "function") unsubPort();
    };
  }, [wc]);

  // ── Read package.json scripts from the WebContainer ──
  const refreshScripts = useCallback(async () => {
    if (!wc || !wcMounted) {
      setAvailableScripts([]);
      return;
    }
    const scripts = await readPackageScripts(wc);
    setAvailableScripts(Object.keys(scripts));
  }, [wc, wcMounted]);

  useEffect(() => {
    refreshScripts();
  }, [refreshScripts]);

  // ── Run / stop server process ──
  const runServerScript = useCallback(
    async (scriptName: "dev" | "start") => {
      if (!wc || !availableScripts.includes(scriptName)) return;

      // Stop existing server process first
      if (serverProcessRef.current) {
        try {
          serverProcessRef.current.kill();
        } catch {
          // Ignore if already exited
        }
      }

      setActivePorts([]);
      setIsStartingServer(true);
      setRunningScript(scriptName);

      try {
        const process = await spawnNpmScript(wc, scriptName);
        serverProcessRef.current = process;
        setServerProcessId(`${scriptName}-${Date.now()}`);

        // Pipe server stdout/stderr into the xterm terminal
        const terminal = terminalRef.current?.terminal ?? null;
        process.output.pipeTo(
          new WritableStream({
            write(chunk: string) {
              terminal?.write(chunk);
            },
          })
        ).catch(() => { /* stream closed */ });

        process.exit
          .then(() => {
            if (serverProcessRef.current === process) {
              serverProcessRef.current = null;
              setRunningScript(null);
              setServerProcessId(null);
              setIsStartingServer(false);
            }
          })
          .catch(() => {
            if (serverProcessRef.current === process) {
              serverProcessRef.current = null;
              setRunningScript(null);
              setServerProcessId(null);
              setIsStartingServer(false);
            }
          });
      } catch (err) {
        console.error(`Failed to run npm script: ${scriptName}`, err);
        serverProcessRef.current = null;
        setRunningScript(null);
        setServerProcessId(null);
        setIsStartingServer(false);
      }
    },
    [wc, availableScripts]
  );

  const stopServer = useCallback(() => {
    if (!serverProcessRef.current) return;
    teardownProject(serverProcessRef.current);
    serverProcessRef.current = null;
    setRunningScript(null);
    setServerProcessId(null);
    setIsStartingServer(false);
    setActivePorts([]);
  }, []);

  // (server cleanup on unmount is handled by the combined teardown effect above)

  // ── Auto-show preview pane when a server becomes ready ──
  useEffect(() => {
    if (activePorts.length > 0 && !showPreviewPane) {
      setShowPreviewPane(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePorts.length]);

  // ── Stable props for PreviewPane (avoid re-renders on every keystroke) ──
  const previewPorts = useMemo(
    () => activePorts.map((ap) => ({ port: ap.port, url: ap.url })),
    [activePorts]
  );
  const handleClosePreview = useCallback(() => setShowPreviewPane(false), []);

  // ── Splitter drag handlers ──
  const handleSplitterMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingSplitter(true);

      const container = splitContainerRef.current;
      if (!container) return;

      const onMouseMove = (ev: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const pct = Math.min(Math.max((x / rect.width) * 100, 20), 80);
        setSplitPercent(pct);
      };

      const onMouseUp = () => {
        setIsDraggingSplitter(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    []
  );

  // ── Load project metadata ──
  useEffect(() => {
    if (!mounted || !isLoggedIn || !projectId || !userHash) return;
    (async () => {
      try {
        const p = await getProject(projectId, userHash);
        if (!p) {
          setNotFound(true);
        } else {
          setProject(p);

          // If the OPFS tree is empty, seed it with the project's starter content
          const tree = await listTree(userHash, projectId);
          if (tree.length === 0 && p.content) {
            const ext =
              { typescript: "ts", javascript: "js", python: "py", html: "html", css: "css" }[
              p.language
              ] ?? "txt";
            const mainFile = `main.${ext}`;
            await writeFile(userHash, projectId, mainFile, p.content, encryptionKey ?? undefined);
            setRefreshTree((n) => n + 1);
            // Auto-open the seeded file
            setActivePath(mainFile);
            setTabs([{ path: mainFile }]);
            setFileContent(p.content);

            // Sync the seeded file into WebContainer if already booted
            if (wc) {
              syncFileToContainer(wc, mainFile, p.content).catch((err) =>
                console.warn("[sync] Failed to seed file in container:", err)
              );
            }
          }
        }
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [mounted, isLoggedIn, projectId, userHash, encryptionKey, wc]);

  // ── Sidebar → WebContainer sync callbacks ──
  const handleSidebarFileCreated = useCallback(
    (path: string, content: string) => {
      if (!wc) return;
      syncFileToContainer(wc, path, content).catch((err) =>
        console.warn("[sync] Failed to mirror new file to container:", err)
      );
    },
    [wc]
  );

  const handleSidebarFolderCreated = useCallback(
    (path: string) => {
      if (!wc) return;
      syncDirToContainer(wc, path).catch((err) =>
        console.warn("[sync] Failed to mirror new folder to container:", err)
      );
    },
    [wc]
  );

  const handleSidebarEntryDeleted = useCallback(
    (path: string) => {
      if (!wc) return;
      syncDeleteInContainer(wc, path).catch((err) =>
        console.warn("[sync] Failed to mirror deletion to container:", err)
      );
    },
    [wc]
  );

  // ── Mount OPFS project files + auto npm install (handles project switching) ──
  useEffect(() => {
    if (!wc || !project || !userHash) return;

    const isSwitch = mountedProjectRef.current !== null && mountedProjectRef.current !== projectId;
    const isFirstMount = mountedProjectRef.current === null && !wcMounted;

    // Nothing to do if this project is already mounted
    if (!isFirstMount && !isSwitch) return;

    let cancelled = false;

    (async () => {
      try {
        const terminal = terminalRef.current?.terminal ?? null;
        const shellProc = terminalRef.current?.shellProcess ?? null;

        // ── If switching projects, tear down the old session first ──
        if (isSwitch) {
          // 1. Stop the sync manager for the old project
          if (syncManagerRef.current) {
            await syncManagerRef.current.stop();
            syncManagerRef.current = null;
          }

          // 2. Reset editor state for the new project
          setWcMounted(false);
          setAvailableScripts([]);
          setRunningScript(null);
          setServerProcessId(null);
          setIsStartingServer(false);
          setActivePorts([]);
          setActivePath(null);
          setTabs([]);
          setFileContent("");

          // 3. switchProject: kill processes → wipe FS → clear terminal → mount + npm install
          await switchProject({
            instance: wc,
            shellProcess: shellProc,
            serverProcess: serverProcessRef.current,
            userHash,
            projectId,
            encryptionKey: encryptionKey ?? undefined,
            terminal,
            callbacks: {
              onPhase: (phase) => {
                if (!cancelled) setRehydrationPhase(phase);
              },
              onInstallError: (code) => {
                console.warn(`npm install exited with code ${code}`);
              },
            },
          });

          serverProcessRef.current = null;

          // 4. Spawn a fresh jsh shell (after FS is ready)
          if (!cancelled) {
            await terminalRef.current?.resetShell();
          }
        } else {
          // ── First mount — just rehydrate ──
          await rehydrateProject(
            wc,
            userHash,
            projectId,
            encryptionKey ?? undefined,
            terminal,
            {
              onPhase: (phase) => {
                if (!cancelled) setRehydrationPhase(phase);
              },
              onInstallError: (code) => {
                console.warn(`npm install exited with code ${code}`);
              },
            }
          );
        }

        if (!cancelled) {
          mountedProjectRef.current = projectId;
          setWcMounted(true);

          // Auto-inject COEP/COOP headers into Vite/Webpack configs
          injectHeaderConfig(wc).catch((err) =>
            console.warn("[injectHeaderConfig] Failed:", err)
          );

          // ── Seed React starter for empty projects ──
          const termForInit = terminalRef.current?.terminal ?? null;
          initializeProject(
            wc,
            userHash,
            projectId,
            termForInit,
            writeFile,
            encryptionKey ?? undefined,
            {
              onPhase: (phase) => {
                if (!cancelled) setRehydrationPhase(phase);
              },
              onInstallError: (code) => {
                console.warn(`[initializeProject] npm install exited with code ${code}`);
              },
              onTemplateSeeded: () => {
                // Refresh the sidebar tree to show the new files
                if (!cancelled) setRefreshTree((n) => n + 1);
              },
            }
          ).catch((err) =>
            console.warn("[initializeProject] Failed:", err)
          );

          // Start the sync manager for the new project
          const mgr = new WCSyncManager(wc, writeQueue, {
            userHash,
            projectId,
            encryptionKey: encryptionKey ?? undefined,
            writeFileToOPFS: writeFile,
            onSyncBack: (path) => {
              console.info(`[SyncManager] Synced back: ${path}`);
              setRefreshTree((n) => n + 1);
            },
          });
          syncManagerRef.current = mgr;
          mgr.start();
        }
      } catch (err) {
        console.error("Failed to mount/switch project:", err);
        if (!cancelled) setRehydrationPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wc, project, userHash, projectId, encryptionKey, wcMounted, writeQueue]);

  // ── Cleanup: stop sync manager + teardown processes on unmount ──
  useEffect(() => {
    return () => {
      syncManagerRef.current?.stop();
      syncManagerRef.current = null;
      teardownProject(serverProcessRef.current);
      serverProcessRef.current = null;
      mountedProjectRef.current = null;
    };
  }, []);

  // ── Open a file ──
  const openFile = useCallback(
    async (path: string) => {
      if (!userHash) return;
      try {
        const content = await readFile(userHash, projectId, path, encryptionKey ?? undefined);
        setFileContent(content);
        setActivePath(path);

        // Add tab if not already open
        setTabs((prev) => {
          if (prev.some((t) => t.path === path)) return prev;
          return [...prev, { path }];
        });
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    },
    [projectId, userHash, encryptionKey]
  );
  // ── Close a tab ──
  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        // If we closed the active tab, switch to the last remaining tab
        if (path === activePath) {
          if (next.length > 0) {
            const newActive = next[next.length - 1].path;
            openFile(newActive);
          } else {
            setActivePath(null);
            setFileContent("");
          }
        }
        return next;
      });
    },
    [activePath, openFile]
  );

  // ── Fast WC FS sync (called on explicit save) ──
  const syncToContainer = useCallback(
    (path: string, content: string) => {
      if (!wc) return;
      syncFileToContainer(wc, path, content).catch((err) =>
        console.warn("[sync] Failed to mirror file to container:", err)
      );
      if (path === "package.json") {
        refreshScripts();
      }
    },
    [wc, refreshScripts]
  );

  // ── AI Agent: apply file action ──
  const handleApplyFileAction = useCallback(
    async (action: FileAction) => {
      if (!userHash) return;
      try {
        // Write to OPFS
        await writeFile(userHash, projectId, action.path, action.content, encryptionKey ?? undefined);
        // Sync to WebContainer
        syncToContainer(action.path, action.content);
        // If this file is currently open, update the editor
        if (action.path === activePathRef.current) {
          setFileContent(action.content);
        }
        // Refresh sidebar tree in case new files were created
        setRefreshTree((n) => n + 1);
      } catch (err) {
        console.error("Failed to apply AI file action:", err);
      }
    },
    [userHash, projectId, encryptionKey, syncToContainer]
  );

  // ── AI Agent: read file content for diff ──
  const handleReadFileContent = useCallback(
    async (path: string): Promise<string> => {
      if (!userHash) return "";
      try {
        return await readFile(userHash, projectId, path, encryptionKey ?? undefined);
      } catch {
        return "";
      }
    },
    [userHash, projectId, encryptionKey]
  );

  // ── Explicit save (Ctrl+S / Save button) ──
  const saveFile = useCallback(
    async () => {
      const path = activePathRef.current;
      if (!path || !userHash) return;
      setIsSaving(true);
      try {
        await writeFile(userHash, projectId, path, fileContent, encryptionKey ?? undefined);
        setLastSaved(new Date());
        // Clear dirty indicator on this tab
        setTabs((prev) =>
          prev.map((t) => (t.path === path ? { ...t, dirty: false } : t))
        );
        // Sync to WebContainer FS so the running server sees the change
        syncToContainer(path, fileContent);
      } catch (err) {
        console.error("Save failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, userHash, encryptionKey, fileContent, syncToContainer]
  );

  // ── Ctrl+S keyboard shortcut ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  function handleEditorChange(value: string | undefined) {
    const v = value ?? "";
    setFileContent(v);

    // Mark tab dirty
    if (activePath) {
      setTabs((prev) =>
        prev.map((t) =>
          t.path === activePath ? { ...t, dirty: true } : t
        )
      );
    }
  }

  // ── Flush unsaved changes + navigate (full reload) ──
  const flushAndNavigate = useCallback(
    async (url: string) => {
      if (isFlushing.current) return;
      isFlushing.current = true;

      try {
        // 1. Save any unsaved content
        const pendingPath = activePathRef.current;
        if (pendingPath && userHash && fileContent) {
          await writeFile(
            userHash,
            projectId,
            pendingPath,
            fileContent,
            encryptionKey ?? undefined
          );
        }

        // 2. Flush the OPFS write queue (sync-manager backlog)
        await writeQueue.flush();

        // 3. Stop the sync manager
        if (syncManagerRef.current) {
          await syncManagerRef.current.stop();
          syncManagerRef.current = null;
        }

        // 4. Kill server process
        teardownProject(serverProcessRef.current);
        serverProcessRef.current = null;
      } catch (err) {
        console.warn("[flushAndNavigate] Flush error (navigating anyway):", err);
      }

      // 5. Full page reload — destroys the WebContainer JS heap
      window.location.assign(url);
    },
    [userHash, projectId, encryptionKey, fileContent, writeQueue]
  );

  // ── Auth loading ──
  if (!mounted || !isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
      </div>
    );
  }

  // ── Project loading ──
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-indigo" />
      </div>
    );
  }

  // ── Not found ──
  if (notFound || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-center">
        <FileCode className="mb-4 h-12 w-12 text-muted/30" />
        <h1 className="mb-2 text-xl font-bold text-foreground">
          Project Not Found
        </h1>
        <p className="mb-6 text-sm text-muted">
          The project you&apos;re looking for doesn&apos;t exist or was deleted.
        </p>
        <a
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            flushAndNavigate("/dashboard");
          }}
          className="text-sm text-indigo transition-colors hover:text-indigo-light"
        >
          ← Back to Dashboard
        </a>
      </div>
    );
  }

  // ── Language for Monaco ──
  const monacoLang = activePath ? detectLanguage(activePath) : "plaintext";

  // ── Main layout ──
  return (
    <AIProvider>
      <PendingChangeProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          {/* ─── Top bar ─── */}
          <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 sm:px-5">
            <div className="flex items-center gap-3">
              <a
                href="/dashboard"
                onClick={(e) => {
                  e.preventDefault();
                  flushAndNavigate("/dashboard");
                }}
                className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </a>

              <div className="h-4 w-px bg-border" />

              <Link href="/" className="flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo text-white">
                  <Terminal className="h-3 w-3" />
                </div>
              </Link>

              <div className="h-4 w-px bg-border" />

              <span className="text-sm font-medium text-foreground line-clamp-1 max-w-[200px]">
                {project.name}
              </span>
              <span className="rounded-md bg-indigo/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo">
                {project.language}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Save indicator */}
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving…
                  </>
                ) : lastSaved ? (
                  <>
                    <Save className="h-3 w-3" />
                    Saved
                  </>
                ) : null}
              </span>

              {/* Explicit Save button */}
              {activePath && (
                <button
                  onClick={saveFile}
                  disabled={isSaving}
                  className="hidden items-center gap-1 rounded-md border border-border-light px-2 py-1 text-[11px] text-muted transition-colors hover:text-foreground sm:flex disabled:opacity-50"
                  title="Save file (Ctrl+S)"
                >
                  <Save className="h-3 w-3" />
                  Save
                  <kbd className="ml-0.5 rounded border border-border-light bg-surface px-1 py-px text-[9px] text-muted/60">
                    ⌘S
                  </kbd>
                </button>
              )}

              <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
                <WifiOff className="h-3 w-3" />
                Offline Ready
              </span>

              {availableScripts.includes("dev") && (
                <button
                  onClick={() => runServerScript("dev")}
                  className="hidden items-center gap-1 rounded-md border border-border-light px-2 py-1 text-[11px] text-muted transition-colors hover:text-foreground sm:flex"
                >
                  <Play className="h-3 w-3" />
                  Run dev
                </button>
              )}

              {availableScripts.includes("start") && (
                <button
                  onClick={() => runServerScript("start")}
                  className="hidden items-center gap-1 rounded-md border border-border-light px-2 py-1 text-[11px] text-muted transition-colors hover:text-foreground sm:flex"
                >
                  <Play className="h-3 w-3" />
                  Run start
                </button>
              )}

              {runningScript && (
                <button
                  onClick={stopServer}
                  className="hidden items-center gap-1 rounded-md border border-red-400/30 px-2 py-1 text-[11px] text-red-300 transition-colors hover:text-red-200 sm:flex"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              )}

              {/* Run active file */}
              {activePath && (
                <button
                  onClick={async () => {
                    if (activePath) {
                      await terminalRef.current?.writeToShell("node " + activePath + "\r");
                    }
                  }}
                  className="hidden items-center gap-1 rounded-md border border-green-400/30 px-2 py-1 text-[11px] text-green-400 transition-colors hover:text-green-300 sm:flex"
                  title={`Run ${activePath}`}
                >
                  <Play className="h-3 w-3" />
                  Run
                </button>
              )}

              {/* Show/Hide Preview toggle */}
              <button
                onClick={() => setShowPreviewPane((v) => !v)}
                className={`hidden items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors sm:flex ${showPreviewPane
                    ? "border-indigo bg-indigo/10 text-indigo-light"
                    : "border-border-light text-muted hover:text-foreground"
                  }`}
                title={showPreviewPane ? "Hide preview" : "Show preview"}
              >
                {showPreviewPane ? (
                  <PanelRightClose className="h-3 w-3" />
                ) : (
                  <PanelRightOpen className="h-3 w-3" />
                )}
                Preview
              </button>

              {/* AI Chat toggle */}
              <button
                onClick={() => setShowAIChat((v) => !v)}
                className={`hidden items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors sm:flex ${showAIChat
                    ? "border-indigo bg-indigo/10 text-indigo-light"
                    : "border-border-light text-muted hover:text-foreground"
                  }`}
                title={showAIChat ? "Hide AI chat" : "Show AI chat"}
              >
                <Bot className="h-3 w-3" />
                AI
              </button>

              {(isStartingServer || serverProcessId) && (
                <span className="hidden text-[10px] text-muted lg:block">
                  {isStartingServer ? "Starting server…" : `PID ${serverProcessId}`}
                </span>
              )}

              <span className="hidden max-w-[160px] truncate text-[11px] text-muted sm:block">{user}</span>

              <button
                onClick={async () => {
                  await flushAndNavigate("/").catch(() => { });
                  logout();
                }}
                className="rounded-md border border-border-light px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
              >
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          </header>

          {/* ─── Body ─── */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <Sidebar
              projectId={projectId}
              projectName={project.name}
              activePath={activePath}
              onFileSelect={openFile}
              refreshKey={refreshTree}
              userHash={userHash ?? ""}
              encryptionKey={encryptionKey ?? undefined}
              onFileCreated={handleSidebarFileCreated}
              onFolderCreated={handleSidebarFolderCreated}
              onEntryDeleted={handleSidebarEntryDeleted}
            />

            {/* ─── Split Pane Container (Editor + Preview) ─── */}
            <div
              ref={splitContainerRef}
              className="flex flex-1 overflow-hidden"
              style={{ cursor: isDraggingSplitter ? "col-resize" : undefined }}
            >
              {/* ── Left: Editor + Terminal ── */}
              <div
                className="flex flex-col overflow-hidden"
                style={{ width: showPreviewPane ? `${splitPercent}%` : "100%" }}
              >
                {/* Tab bar */}
                <TabBar
                  tabs={tabs}
                  activePath={activePath}
                  onSelect={openFile}
                  onClose={closeTab}
                />

                {/* Monaco or empty state */}
                {activePath ? (
                  <div className="flex-1 overflow-hidden rounded-tr-lg">
                    <MonacoEditor
                      height="100%"
                      language={monacoLang}
                      theme="brand-dark"
                      beforeMount={handleBeforeMount}
                      value={fileContent}
                      onChange={handleEditorChange}
                      options={{
                        fontSize: 14,
                        lineHeight: 1.6,
                        fontFamily:
                          "'JetBrains Mono', 'Fira Code', monospace",
                        fontLigatures: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        padding: { top: 16, bottom: 16 },
                        lineNumbers: "on",
                        renderLineHighlight: "all",
                        bracketPairColorization: { enabled: true },
                        smoothScrolling: true,
                        cursorBlinking: "expand",
                        cursorSmoothCaretAnimation: "on",
                        cursorWidth: 2,
                        wordWrap: "on",
                        tabSize: 2,
                        automaticLayout: true,
                        roundedSelection: true,
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        guides: {
                          indentation: true,
                          bracketPairs: true,
                        },
                      }}
                    />
                  </div>
                ) : (
                  /* Empty state */
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo/10">
                      <Code2 className="h-8 w-8 text-indigo" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        Welcome to {project.name}
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        Open a file from the sidebar or create a new one to start
                        coding.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[12px] text-muted/60">
                      <span className="flex items-center gap-1.5">
                        <WifiOff className="h-3.5 w-3.5" /> Offline-First
                      </span>
                      <span>•</span>
                      <span>OPFS Storage</span>
                      <span>•</span>
                      <span>Ctrl+S to Save</span>
                    </div>
                  </div>
                )}

                {/* Status bar */}
                <div className="flex items-center justify-between border-t border-border bg-indigo/5 px-4 py-1">
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Offline Ready
                    </span>
                    {activePath && (
                      <span className="capitalize">{monacoLang}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    {activePath && (
                      <>
                        <span>
                          {fileContent.split("\n").length} lines ·{" "}
                          {fileContent.length} chars
                        </span>
                      </>
                    )}
                    <span className="flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${wc
                            ? "bg-emerald-400"
                            : wcBooting
                              ? "bg-amber-400 animate-pulse"
                              : "bg-zinc-500"
                          }`}
                      />
                      {wc ? "Container" : wcBooting ? "Booting…" : "No Container"}
                    </span>
                    {rehydrationPhase && rehydrationPhase !== "ready" && (
                      <span className="flex items-center gap-1">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${rehydrationPhase === "error"
                              ? "bg-red-400"
                              : "bg-amber-400 animate-pulse"
                            }`}
                        />
                        {rehydrationPhase === "mounting"
                          ? "Mounting…"
                          : rehydrationPhase === "installing"
                            ? "Installing…"
                            : "Install Error"}
                      </span>
                    )}
                    {activePorts.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo animate-pulse" />
                        {activePorts.length === 1
                          ? `Port ${activePorts[0].port}`
                          : `${activePorts.length} ports`}
                      </span>
                    )}
                    <span>OPFS</span>
                  </div>
                </div>

                {/* WebContainer Terminal */}
                {wc && <WebTerminal ref={terminalRef} instance={wc} />}
              </div>

              {/* ── Resizable Splitter Handle ── */}
              {showPreviewPane && (
                <div
                  onMouseDown={handleSplitterMouseDown}
                  className={`group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors ${isDraggingSplitter
                      ? "bg-indigo"
                      : "bg-border hover:bg-indigo/60"
                    }`}
                >
                  {/* Grab dots */}
                  <div className="flex flex-col gap-1">
                    <span className={`block h-1 w-1 rounded-full ${isDraggingSplitter ? "bg-white" : "bg-muted/40 group-hover:bg-muted"
                      }`} />
                    <span className={`block h-1 w-1 rounded-full ${isDraggingSplitter ? "bg-white" : "bg-muted/40 group-hover:bg-muted"
                      }`} />
                    <span className={`block h-1 w-1 rounded-full ${isDraggingSplitter ? "bg-white" : "bg-muted/40 group-hover:bg-muted"
                      }`} />
                  </div>
                </div>
              )}

              {/* ── Right: Iframe Preview ── */}
              {showPreviewPane && (
                <div
                  className="flex overflow-hidden"
                  style={{ width: `${100 - splitPercent}%` }}
                >
                  <PreviewPane
                    ports={previewPorts}
                    onClose={handleClosePreview}
                    isDragging={isDraggingSplitter}
                  />
                </div>
              )}
            </div>

            {/* ── AI Chat Sidebar — always mounted so the worker/state survive hide ── */}
            <ChatSidebar
              isOpen={showAIChat}
              onToggle={() => setShowAIChat((v) => !v)}
              activePath={activePath}
              activeContent={fileContent}
              userHash={userHash ?? ""}
              projectId={projectId}
              encryptionKey={encryptionKey ?? undefined}
              onApplyFileAction={handleApplyFileAction}
              readFileContent={handleReadFileContent}
            />
          </div>
        </div>
      </PendingChangeProvider>
    </AIProvider>
  );
};

export default EditorProjectPage;

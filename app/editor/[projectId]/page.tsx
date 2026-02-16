"use client";

/**
 * /editor/[projectId] — Full-fledged Code Editor.
 *
 * Uses Monaco Editor, OPFS-backed file tree, collapsible sidebar,
 * tabs, and auto-save.
 */

import {
    detectLanguage,
    listTree,
    readFile,
    writeFile,
} from "@/lib/opfs";
import { getProject, type Project } from "@/lib/projects";
import { useAuth } from "../../components/AuthProvider";
import Sidebar from "../../components/editor/Sidebar";
import TabBar, { type TabItem } from "../../components/editor/TabBar";

import type { Monaco } from "@monaco-editor/react";
import {
    ArrowLeft,
    Code2,
    FileCode,
    Loader2,
    LogOut,
    Save,
    Terminal,
    WifiOff,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
} from "react";

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

// ─── Page ───────────────────────────────────────────────────

const EditorProjectPage: FC = () => {
  const { user, isLoggedIn, mounted, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

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

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePathRef = useRef<string | null>(null);

  // Keep ref in sync for the save callback closure
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // ── Route guard ──
  useEffect(() => {
    if (mounted && !isLoggedIn) router.replace("/login");
  }, [mounted, isLoggedIn, router]);

  // ── Load project metadata ──
  useEffect(() => {
    if (!mounted || !isLoggedIn || !projectId) return;
    (async () => {
      try {
        const p = await getProject(projectId);
        if (!p) {
          setNotFound(true);
        } else {
          setProject(p);

          // If the OPFS tree is empty, seed it with the project's starter content
          const tree = await listTree(projectId);
          if (tree.length === 0 && p.content) {
            const ext =
              { typescript: "ts", javascript: "js", python: "py", html: "html", css: "css" }[
                p.language
              ] ?? "txt";
            const mainFile = `main.${ext}`;
            await writeFile(projectId, mainFile, p.content);
            setRefreshTree((n) => n + 1);
            // Auto-open the seeded file
            setActivePath(mainFile);
            setTabs([{ path: mainFile }]);
            setFileContent(p.content);
          }
        }
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isLoggedIn, projectId]);

  // ── Open a file ──
  const openFile = useCallback(
    async (path: string) => {
      try {
        const content = await readFile(projectId, path);
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
    [projectId]
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

  // ── Auto-save to OPFS (1s debounce) ──
  const saveToOPFS = useCallback(
    async (content: string) => {
      const path = activePathRef.current;
      if (!path) return;
      setIsSaving(true);
      try {
        await writeFile(projectId, path, content);
        setLastSaved(new Date());
        // Clear dirty indicator on this tab
        setTabs((prev) =>
          prev.map((t) => (t.path === path ? { ...t, dirty: false } : t))
        );
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [projectId]
  );

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

    // Debounced save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToOPFS(v), 1000);
  }

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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
        <Link
          href="/dashboard"
          className="text-sm text-indigo transition-colors hover:text-indigo-light"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  // ── Language for Monaco ──
  const monacoLang = activePath ? detectLanguage(activePath) : "plaintext";

  // ── Main layout ──
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ─── Top bar ─── */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 sm:px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>

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

          <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            <WifiOff className="h-3 w-3" />
            Offline Ready
          </span>

          <span className="hidden text-[11px] text-muted sm:block">{user}</span>

          <button
            onClick={() => {
              logout();
              router.replace("/");
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
        />

        {/* Editor pane */}
        <div className="flex flex-1 flex-col overflow-hidden">
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
                <span>Auto-Save</span>
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
              <span>OPFS</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorProjectPage;

import { useState, useEffect, useCallback, lazy, Suspense } from "react";

import { useAI } from "./hooks/useAI";
import { useAetherSystem } from "./hooks/useAetherSystem";
import { WebContainerManager } from "./webcontainer/manager";
import { useFileExplorerStore } from "./store/fileExplorerStore";
import { useProjectStore, type Project } from "./store/projectStore";
import { useThemeStore } from "./store/themeStore";
import { getLanguageFromFilename } from "./utils/fileIcons";

import AuthScreen from "./components/AuthScreen";
import Dashboard from "./components/Dashboard";
import FileExplorer from "./components/FileExplorer";

// Lazy-loaded heavy components (code-split for faster cold start)
const EditorTabs = lazy(() => import("./components/EditorTabs"));
const ChatSidebar = lazy(() => import("./components/ChatSidebar"));
const TerminalPanel = lazy(() => import("./components/TerminalPanel"));
const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.default }))
);

// Default code shown in the editor
const DEFAULT_CODE = `// Welcome to SouthStack!
// This file runs inside a WebContainer - a full Node.js
// runtime in your browser. Edit and press Run.

console.log("Hello from SouthStack!");
console.log("Node version:", process.version);

import { cpus } from "node:os";
console.log("Logical CPUs:", cpus().length);
`;

export default function App() {
  const system = useAetherSystem();
  const { isAuthenticated, userId, logout } = system;
  const { activeProjectId, openProject, closeProject } = useProjectStore();

  if (!isAuthenticated) {
    return <AuthScreen system={system} />;
  }

  if (!activeProjectId) {
    return (
      <Dashboard
        userId={userId ?? ""}
        onOpenProject={(project: Project) => openProject(project.id)}
        onLogout={logout}
      />
    );
  }

  return (
    <IDEWorkspace
      userId={userId}
      onLogout={logout}
      onBackToDashboard={closeProject}
    />
  );
}

/* ------------------------------------------------------------------ */
/* IDE WORKSPACE                                                      */
/* ------------------------------------------------------------------ */

interface IDEWorkspaceProps {
  userId: string | null;
  onLogout: () => Promise<void>;
  onBackToDashboard: () => void;
}

function IDEWorkspace({ userId, onLogout, onBackToDashboard }: IDEWorkspaceProps) {
  const {
    currentModel,
    availableModels,
    status,
    statusText,
    downloadProgress,
    switchModel,
    loadModel,
  } = useAI();

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // File explorer store
  const activeFilePath = useFileExplorerStore((s) => s.activeFilePath);
  const activeFileContent = useFileExplorerStore((s) => s.activeFileContent);
  const setActiveFile = useFileExplorerStore((s) => s.setActiveFile);
  const setActiveFileContent = useFileExplorerStore((s) => s.setActiveFileContent);
  const openTab = useFileExplorerStore((s) => s.openTab);
  const openTabs = useFileExplorerStore((s) => s.openTabs);

  // Project
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Local state
  const [code, setCode] = useState(DEFAULT_CODE);
  const [editorLang, setEditorLang] = useState("javascript");
  const [wcReady, setWcReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);

  // Sync editor content when active file changes from explorer
  useEffect(() => {
    if (activeFilePath && activeFileContent !== undefined) {
      setCode(activeFileContent);
      setEditorLang(getLanguageFromFilename(activeFilePath.split("/").pop() ?? ""));
    }
  }, [activeFilePath, activeFileContent]);

  // File open from explorer
  const handleFileOpen = useCallback(
    (path: string, content: string, language: string) => {
      setActiveFile(path, content);
      openTab(path, path.split("/").pop() ?? "file", language);
      setCode(content);
      setEditorLang(language);
    },
    [setActiveFile, openTab]
  );

  // Tab select
  const handleTabSelect = useCallback(
    async (path: string) => {
      try {
        const mgr = WebContainerManager.getInstance();
        const content = await mgr.readFile(path);
        const lang = getLanguageFromFilename(path.split("/").pop() ?? "");
        setActiveFile(path, content);
        setCode(content);
        setEditorLang(lang);
      } catch {
        // File may not exist yet
      }
    },
    [setActiveFile]
  );

  // Save active file on editor change
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const v = value ?? "";
      setCode(v);
      if (activeFilePath) {
        setActiveFileContent(v);
        WebContainerManager.getInstance()
          .writeFile(activeFilePath.replace(/^\//, ""), v)
          .catch(() => { });
      }
    },
    [activeFilePath, setActiveFileContent]
  );

  // Run code in WebContainer
  const runCode = useCallback(async () => {
    if (!wcReady) return;
    const mgr = WebContainerManager.getInstance();
    const filename = activeFilePath
      ? activeFilePath.replace(/^\//, "")
      : "index.js";
    await mgr.writeFile(filename, code);
    await mgr.runCommand("node", [filename]);
  }, [code, wcReady, activeFilePath]);

  // Status bar
  const statusColor =
    status === "ready"
      ? "#22c55e"
      : status === "error"
        ? "#ef4444"
        : status === "loading" || status === "generating"
          ? "#f59e0b"
          : "#94a3b8";

  const isOfflineReady = status === "ready";
  const displayFileName = activeFilePath
    ? activeFilePath.split("/").pop()
    : "index.js";

  return (
    <div className="ide-container">
      {/* HEADER */}
      <header className="ide-header">
        <div className="ide-header-left">
          <button
            className="ide-header-btn ide-back-btn"
            title="Back to Dashboard"
            onClick={onBackToDashboard}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            className="ide-header-btn"
            title="Toggle Explorer"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <div className="ide-header-divider" />
          <span className="ide-logo">&#9889;</span>
          <span className="ide-project-name">{activeProject?.name ?? "SouthStack"}</span>
        </div>

        <div className="ide-header-center">
          {status === "idle" ? (
            <button
              className="ide-model-load-btn"
              onClick={() => loadModel()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Load AI Model
            </button>
          ) : (
            <select
              className="ide-model-select"
              value={currentModel.id}
              onChange={(e) => switchModel(e.target.value)}
              disabled={status === "generating"}
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.size})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="ide-header-right">
          <button
            className="ide-header-btn ide-theme-btn"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            className="ide-run-btn"
            onClick={runCode}
            disabled={!wcReady}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run
          </button>
          <button
            className="ide-header-btn"
            title="Toggle AI Chat"
            onClick={() => setChatSidebarOpen((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <div className="ide-header-divider" />
          <span className="ide-user-avatar" title={`Signed in as ${userId}`}>
            {userId?.charAt(0).toUpperCase()}
          </span>
          <button className="ide-header-btn ide-logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* PROGRESS BAR */}
      {status === "loading" && (
        <div className="ide-progress-track">
          <div
            className="ide-progress-fill"
            style={{ width: `${downloadProgress}%` }}
          />
          <span className="ide-progress-label">
            {downloadProgress}% &#8212; {statusText}
          </span>
        </div>
      )}

      {/* MAIN PANELS */}
      <main className="ide-main">
        {/* Left: File Explorer */}
        {sidebarOpen && (
          <aside className="ide-sidebar">
            <FileExplorer onFileOpen={handleFileOpen} />
          </aside>
        )}

        {/* Center: Editor + Terminal */}
        <section className="ide-center">
          <div className="ide-editor-area">
            <Suspense fallback={<div className="ide-lazy-loading">Loading tabs...</div>}>
              <EditorTabs onTabSelect={handleTabSelect} />
            </Suspense>

            {openTabs.length === 0 && !activeFilePath ? (
              <div className="ide-editor-empty">
                <div className="ide-editor-empty-icon">&#128221;</div>
                <p>Open a file from the explorer to start editing</p>
                <p className="muted">or press Run to execute the default code</p>
              </div>
            ) : (
              <div className="ide-editor-wrapper">
                <Suspense fallback={<div className="ide-lazy-loading">Loading editor...</div>}>
                  <MonacoEditor
                    height="100%"
                    language={editorLang}
                    theme={theme === "dark" ? "vs-dark" : "vs"}
                    value={code}
                    onChange={handleEditorChange}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                      fontLigatures: true,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 12 },
                      renderLineHighlight: "gutter",
                      smoothScrolling: true,
                      cursorBlinking: "smooth",
                      cursorSmoothCaretAnimation: "on",
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </Suspense>
              </div>
            )}
          </div>

          {/* Terminal */}
          <div className="ide-terminal-area">
            <Suspense fallback={<div className="ide-lazy-loading">Loading terminal...</div>}>
              <TerminalPanel onReady={() => setWcReady(true)} />
            </Suspense>
          </div>
        </section>

        {/* Right: AI Chat Sidebar */}
        {chatSidebarOpen && (
          <aside className="ide-chat-sidebar">
            <Suspense fallback={<div className="ide-lazy-loading">Loading chat...</div>}>
              <ChatSidebar />
            </Suspense>
          </aside>
        )}
      </main>

      {/* STATUS BAR */}
      <footer className="ide-status-bar">
        <div className="ide-status-left">
          <span className="ide-status-dot" style={{ backgroundColor: statusColor }} />
          <span>{isOfflineReady ? "Offline Ready" : statusText}</span>
        </div>
        <div className="ide-status-right">
          <span>{wcReady ? "WebContainer active" : "WebContainer inactive"}</span>
          <span className="ide-status-sep">|</span>
          <span>{currentModel.label}</span>
          <span className="ide-status-sep">|</span>
          <span>{displayFileName}</span>
        </div>
      </footer>
    </div>
  );
}

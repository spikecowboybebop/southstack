"use client";

/**
 * ChatSidebar — Collapsible AI chat panel for the code editor.
 *
 * Integrates with the Web Worker AI engine to provide a fully
 * offline, privacy-first coding assistant. Features:
 *
 *   - Message history with streaming token display
 *   - Model loading with progress bar
 *   - FILE block parsing → DiffView for accept/reject
 *   - Context-aware prompts (current file + project tree)
 *   - WebGPU badge / CPU fallback indicator
 */

import { gatherContext } from "@/lib/ai-context";
import {
    useAIEngine,
    type ChatMessage,
} from "@/lib/ai-engine";
import { parseAIResponse, type FileAction } from "@/lib/ai-parser";
import {
    Bot,
    ChevronRight,
    Cpu,
    Download,
    Loader2,
    Send,
    Square,
    User,
    Zap
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
} from "react";
import DiffView from "./DiffView";

// ─── Types ──────────────────────────────────────────────────

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Parsed file actions from the assistant's response */
  actions?: FileAction[];
  /** Which actions have been accepted/rejected (by path) */
  actionStatus?: Record<string, "accepted" | "rejected">;
  /** Whether this message is still being streamed */
  streaming?: boolean;
}

interface ChatSidebarProps {
  /** Whether the sidebar is currently visible */
  isOpen: boolean;
  /** Toggle the sidebar open/closed */
  onToggle: () => void;
  /** Current file path in the editor */
  activePath: string | null;
  /** Current file content in the editor */
  activeContent: string;
  /** User hash for OPFS access */
  userHash: string;
  /** Current project ID */
  projectId: string;
  /** Encryption key for OPFS */
  encryptionKey?: CryptoKey;
  /** Callback when the user accepts a file change from the AI */
  onApplyFileAction: (action: FileAction) => void;
  /** Read a file's current content (for diff comparison) */
  readFileContent: (path: string) => Promise<string>;
}

// ─── Component ──────────────────────────────────────────────

const ChatSidebar: FC<ChatSidebarProps> = ({
  isOpen,
  onToggle,
  activePath,
  activeContent,
  userHash,
  projectId,
  encryptionKey,
  onApplyFileAction,
  readFileContent,
}) => {
  const ai = useAIEngine();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // hold per-action original content for the diff viewer
  const [fileSnapshots, setFileSnapshots] = useState<Record<string, string>>({});

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when sidebar opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ── Handle sending a message ──
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || ai.status === "generating") return;
    if (ai.status !== "ready") return;

    setInput("");

    // Add user message
    const userMsg: UIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: UIMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Gather project context
    let systemPrompt = "";
    try {
      const ctx = await gatherContext(
        userHash,
        projectId,
        activePath,
        activeContent,
        encryptionKey
      );
      systemPrompt = ctx.systemContext;
    } catch {
      systemPrompt =
        "You are a coding assistant in an IDE called SouthStack. Help the user with their code.";
    }

    // Build message history for the LLM
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: prompt },
    ];

    // Stream tokens
    ai.chat(
      chatMessages,
      // onToken
      (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + token }
              : m
          )
        );
      },
      // onDone
      async (fullText) => {
        const parsed = parseAIResponse(fullText);

        // Pre-read the file snapshots so DiffView can show proper diffs
        const snapshots: Record<string, string> = {};
        for (const action of parsed.actions) {
          try {
            snapshots[action.path] = await readFileContent(action.path);
          } catch {
            snapshots[action.path] = ""; // new file
          }
        }
        setFileSnapshots((prev) => ({ ...prev, ...snapshots }));

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: fullText,
                  streaming: false,
                  actions:
                    parsed.actions.length > 0 ? parsed.actions : undefined,
                  actionStatus: {},
                }
              : m
          )
        );
      },
      // onError
      (error) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `⚠️ Error: ${error}`,
                  streaming: false,
                }
              : m
          )
        );
      }
    );
  }, [
    input,
    ai,
    messages,
    userHash,
    projectId,
    activePath,
    activeContent,
    encryptionKey,
    readFileContent,
  ]);

  // ── Accept a file action ──
  const handleAccept = useCallback(
    (msgId: string, action: FileAction) => {
      onApplyFileAction(action);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                actionStatus: {
                  ...m.actionStatus,
                  [action.path]: "accepted",
                },
              }
            : m
        )
      );
    },
    [onApplyFileAction]
  );

  // ── Reject a file action ──
  const handleReject = useCallback((msgId: string, action: FileAction) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              actionStatus: {
                ...m.actionStatus,
                [action.path]: "rejected",
              },
            }
          : m
      )
    );
  }, []);

  // ── Keyboard shortcuts ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Render explanation text (strip FILE blocks for display) ──
  const renderContent = useCallback((msg: UIMessage) => {
    if (msg.streaming) return msg.content;
    if (!msg.actions || msg.actions.length === 0) return msg.content;
    // Show only the explanation part (FILE blocks rendered as DiffView)
    return parseAIResponse(msg.content).explanation;
  }, []);

  // ── Toggle button (always visible) ──
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-3 top-1/2 z-40 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-lg transition-colors hover:bg-surface-light"
        title="Open AI Chat"
      >
        <Bot className="h-4 w-4 text-indigo" />
      </button>
    );
  }

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-surface">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo" />
          <span className="text-xs font-semibold text-foreground">
            AI Agent
          </span>
          {ai.modelId && (
            <span className="rounded bg-indigo/10 px-1.5 py-0.5 text-[9px] text-indigo">
              {ai.modelId.split("-").slice(0, 3).join("-")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* GPU/CPU badge */}
          {ai.hasGPU !== null && (
            <span
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${
                ai.hasGPU
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
              title={
                ai.hasGPU ? "WebGPU accelerated" : "CPU mode (no WebGPU)"
              }
            >
              {ai.hasGPU ? (
                <Zap className="h-2.5 w-2.5" />
              ) : (
                <Cpu className="h-2.5 w-2.5" />
              )}
              {ai.hasGPU ? "GPU" : "CPU"}
            </span>
          )}
          <button
            onClick={onToggle}
            className="rounded p-1 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            title="Close chat"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Model Loading ─── */}
      {ai.status === "idle" && (
        <div className="flex flex-col items-center gap-3 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo/10">
            <Bot className="h-6 w-6 text-indigo" />
          </div>
          <p className="text-center text-[11px] text-muted">
            Load a local AI model to get started. The model runs entirely
            in your browser — nothing leaves this device.
          </p>
          <button
            onClick={() => ai.loadModel()}
            className="flex items-center gap-2 rounded-lg bg-indigo px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-dark"
          >
            <Download className="h-3.5 w-3.5" />
            Load Model
          </button>
          <p className="text-center text-[9px] text-muted/60">
            {ai.hasGPU
              ? "WebGPU detected — Qwen2.5-Coder-1.5B (~1 GB)"
              : ai.hasGPU === false
                ? "No WebGPU — Qwen2.5-0.5B CPU fallback (~400 MB)"
                : "Detecting GPU…"}
          </p>
        </div>
      )}

      {ai.status === "loading" && (
        <div className="flex flex-col items-center gap-3 p-4">
          <Loader2 className="h-6 w-6 animate-spin text-indigo" />
          <p className="text-center text-[11px] text-muted">{ai.loadText}</p>
          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-indigo transition-all duration-300"
              style={{ width: `${Math.round(ai.loadProgress * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted/60">
            {Math.round(ai.loadProgress * 100)}% —{" "}
            {ai.loadProgress < 1
              ? "First load downloads to IndexedDB"
              : "Almost ready…"}
          </p>
        </div>
      )}

      {ai.status === "error" && !ai.modelId && (
        <div className="flex flex-col items-center gap-3 p-4">
          <p className="text-center text-[11px] text-red-400">
            {ai.error}
          </p>
          <button
            onClick={() => ai.loadModel()}
            className="flex items-center gap-2 rounded-lg bg-indigo px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-dark"
          >
            <Download className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* ─── Message History ─── */}
      {(ai.status === "ready" || ai.status === "generating" || (ai.status === "error" && ai.modelId)) && (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <Bot className="h-8 w-8 text-muted/20" />
                <p className="text-[11px] text-muted/60">
                  Ask me to create, edit, or explain code.
                  {activePath
                    ? ` I can see your open file: ${activePath}`
                    : " Open a file to give me context."}
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="group">
                {/* Message bubble */}
                <div
                  className={`flex gap-2 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo/20 mt-0.5">
                      <Bot className="h-3 w-3 text-indigo" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo/20 text-foreground"
                        : "bg-white/5 text-foreground"
                    }`}
                  >
                    <pre className="whitespace-pre-wrap break-words font-sans">
                      {renderContent(msg)}
                      {msg.streaming && (
                        <span className="inline-block h-3 w-1.5 animate-pulse bg-indigo ml-0.5" />
                      )}
                    </pre>
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 mt-0.5">
                      <User className="h-3 w-3 text-muted" />
                    </div>
                  )}
                </div>

                {/* File actions — DiffView */}
                {msg.actions &&
                  !msg.streaming &&
                  msg.actions.map((action) => {
                    const status = msg.actionStatus?.[action.path];
                    if (status === "accepted") {
                      return (
                        <div
                          key={action.path}
                          className="ml-7 mt-1 flex items-center gap-1 text-[10px] text-emerald-400"
                        >
                          ✓ Applied: {action.path}
                        </div>
                      );
                    }
                    if (status === "rejected") {
                      return (
                        <div
                          key={action.path}
                          className="ml-7 mt-1 flex items-center gap-1 text-[10px] text-red-400"
                        >
                          ✗ Rejected: {action.path}
                        </div>
                      );
                    }
                    return (
                      <div key={action.path} className="ml-7">
                        <DiffView
                          action={action}
                          currentContent={fileSnapshots[action.path] ?? ""}
                          onAccept={(a) => handleAccept(msg.id, a)}
                          onReject={(a) => handleReject(msg.id, a)}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>

          {/* ─── Input Area ─── */}
          <div className="border-t border-border/50 p-3">
            {ai.status === "generating" && (
              <button
                onClick={ai.abort}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-foreground hover:border-border-light"
              >
                <Square className="h-3 w-3" />
                Stop generating
              </button>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  ai.status === "generating"
                    ? "Generating…"
                    : "Ask the AI agent…"
                }
                disabled={ai.status === "generating"}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder-muted/50 outline-none transition-colors focus:border-indigo disabled:opacity-50"
                style={{ maxHeight: "80px" }}
              />
              <button
                onClick={handleSend}
                disabled={
                  !input.trim() || ai.status === "generating"
                }
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-indigo text-white transition-colors hover:bg-indigo-dark disabled:opacity-30"
                title="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 text-[9px] text-muted/40 text-center">
              100% local · your code never leaves this device
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatSidebar;

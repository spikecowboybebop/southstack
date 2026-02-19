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
import { usePendingPaths, type PendingReview } from "@/lib/pending-change-context";
import {
    Bot,
    CheckCheck,
    ChevronRight,
    Cpu,
    FileClock,
    Loader2,
    Send,
    Square,
    User,
    X,
    Zap
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
} from "react";
import MarkdownRenderer from "./MarkdownRenderer";

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

// ─── Helpers ────────────────────────────────────────────────

/**
 * Derive a short human-readable model name from the raw WebLLM modelId.
 * Falls back to stripping the quantisation suffix (e.g. "-q4f16_1-MLC").
 */
function modelDisplayName(modelId: string | null): string {
  if (!modelId) return "Local Model";
  if (modelId.includes("Qwen3-Coder-Next"))   return "Qwen3-Coder-Next (Local)";
  if (modelId.includes("Qwen2.5-Coder-1.5B")) return "Qwen2.5-Coder-1.5B (Local)";
  if (modelId.includes("Qwen2.5-0.5B"))       return "Qwen2.5-0.5B (Local)";
  if (modelId.includes("Qwen2.5-Coder"))      return "Qwen2.5-Coder (Local)";
  if (modelId.includes("Qwen3"))              return "Qwen3-Coder (Local)";
  // Generic fallback: strip quantisation tag
  return (modelId.split("-q4")[0] ?? modelId) + " (Local)";
}

// ─── ReviewOverlay ──────────────────────────────────────────────────────────
// Absolutely-positioned panel that floats over the chat at the bottom.
// Uses position:absolute + bottom:0 so it is ALWAYS visible regardless of
// the flex-col / overflow-y-auto layout of the sidebar.  The sidebar
// container must have position:relative (set below) for this to work.
// pointer-events:auto guarantees buttons are clickable even while streaming.
function ReviewOverlay({
  onApplyFileAction,
  setMessages,
}: {
  onApplyFileAction: (action: import("@/lib/ai-parser").FileAction) => void;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
}) {
  const { pendingReview, setPendingReview, clearPendingPaths } = usePendingPaths();

  if (!pendingReview) return null;

  const dismiss = (accepted: boolean) => {
    if (accepted) {
      pendingReview.actions.forEach((a) => onApplyFileAction(a));
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === pendingReview.messageId
          ? {
              ...m,
              actionStatus: Object.fromEntries(
                pendingReview.actions.map((a) => [
                  a.path,
                  accepted ? ("accepted" as const) : ("rejected" as const),
                ])
              ),
            }
          : m
      )
    );
    setPendingReview(null);
    clearPendingPaths();
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        pointerEvents: "auto",
      }}
      className="border-t-2 border-amber-500/50 bg-[#0e0b00]/95 px-3 pb-3 pt-2.5 backdrop-blur-sm shadow-[0_-12px_32px_rgba(0,0,0,0.7)]"
    >
      {/* Title + file count */}
      <div className="mb-2 flex items-center gap-1.5">
        <FileClock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="text-[11px] font-semibold tracking-wide text-amber-300">
          Review AI Changes
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-medium text-amber-400">
          {pendingReview.actions.length}&nbsp;file
          {pendingReview.actions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* File list */}
      <div className="mb-3 space-y-0.5">
        {pendingReview.actions.map(({ path }) => (
          <div key={path} className="flex items-center gap-1.5">
            <span className="h-1 w-1 shrink-0 rounded-full bg-amber-400/70" />
            <span className="font-mono text-[10px] text-foreground/60 truncate">
              {path}
            </span>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => dismiss(true)}
          style={{ pointerEvents: "auto" }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white shadow-md transition-colors hover:bg-emerald-500 active:scale-[0.98]"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Accept Changes
        </button>
        <button
          onClick={() => dismiss(false)}
          style={{ pointerEvents: "auto" }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-500/50 bg-red-600/15 px-3 py-2 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-600/25 active:scale-[0.98]"
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
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
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);

  // ── Review gate — stored in context so it persists when sidebar is hidden ──
  const {
    pendingReview,
    setPendingReview,
    registerPendingPaths,
    clearPendingPaths,
  } = usePendingPaths();

  // ── Streaming detection ──────────────────────────────────────────────────
  // accumulatedCode builds the full raw AI output token-by-token.
  // isApplyingChanges / pendingFilePath are set the moment FILE: is detected
  // mid-stream so the "Reviewing…" badge appears immediately, before onDone.
  const accumulatedCode = useRef("");
  const detectedRef = useRef(false); // avoids setState on every token
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Keep a stable ref to messages so queued-prompt fires never use a stale snapshot
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
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
  const handleSend = useCallback(async (promptOverride?: string) => {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || ai.status === "generating") return;

    // Model not ready yet — queue the prompt; it fires automatically on ready
    if (ai.status !== "ready") {
      if (!promptOverride) {
        setQueuedPrompt(prompt);
        setInput("");
      }
      return;
    }

    if (!promptOverride) setInput("");
    setQueuedPrompt(null);

    // Reset streaming-detection state for this new request
    accumulatedCode.current = "";
    detectedRef.current = false;
    setIsApplyingChanges(false);
    setPendingFilePath(null);

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
      ...messagesRef.current.map((m) => ({
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
        accumulatedCode.current += token;

        // Detect FILE: <path> as soon as it appears in the stream
        // so the "Reviewing…" badge shows up while the AI is still writing.
        if (!detectedRef.current) {
          const m = /FILE:\s*([^\n]+)/.exec(accumulatedCode.current);
          if (m) {
            detectedRef.current = true;
            setIsApplyingChanges(true);
            setPendingFilePath(m[1].trim());
          }
        }

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

        // Gate: if the AI proposed file changes, push to context for review.
        // Nothing is written until the user clicks "Accept Changes".
        if (parsed.actions.length > 0) {
          const review: PendingReview = { messageId: assistantId, actions: parsed.actions };
          setPendingReview(review);
          registerPendingPaths(parsed.actions.map((a) => a.path));
        }

        // Clear local streaming detection — context state takes over
        setIsApplyingChanges(false);
        setPendingFilePath(null);
        detectedRef.current = false;
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
    userHash,
    projectId,
    activePath,
    activeContent,
    encryptionKey,
    readFileContent,
  ]);

  // ── Fire queued prompt as soon as model becomes ready ──
  useEffect(() => {
    if (ai.status === "ready" && queuedPrompt !== null) {
      handleSend(queuedPrompt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.status]);

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

  // ── Render explanation text (strip FILE blocks for display in MarkdownRenderer) ──
  const renderContent = useCallback((msg: UIMessage) => {
    if (msg.streaming) return msg.content;
    if (!msg.actions || msg.actions.length === 0) return msg.content;
    // Show only the explanation part (FILE blocks rendered as DiffView)
    return parseAIResponse(msg.content).explanation;
  }, []);

  // ── Always render both the toggle button and the panel; use CSS to show/hide ──
  return (
    <>
      {/* Floating toggle button — shown when sidebar is closed */}
      <button
        onClick={onToggle}
        style={{ display: isOpen ? "none" : "flex" }}
        className="fixed right-3 top-1/2 z-40 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-lg transition-colors hover:bg-surface-light"
        title="Open AI Chat"
      >
        <Bot className="h-4 w-4 text-indigo" />
      </button>

      {/* Full sidebar panel — position:relative so ReviewOverlay can use absolute bottom:0 */}
      <div
        style={{ display: isOpen ? "flex" : "none" }}
        className="relative h-full w-[340px] shrink-0 flex-col border-l border-border bg-surface"
      >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo" />
          <span className="text-xs font-semibold text-foreground">
            AI Agent
          </span>
          {/* Status dot — minimal indicator */}
          {ai.status === "ready" && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title={modelDisplayName(ai.modelId)} />
          )}
          {(ai.status === "idle" || ai.status === "loading") && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" title="Initializing…" />
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

      {/* ─── Body: messages + init bar + error ─── */}

      {/* Error bar (no model loaded + failed) */}
      {ai.status === "error" && !ai.modelId && (
        <div className="flex items-center justify-between gap-2 border-b border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="truncate text-[11px] text-red-400">{ai.error ?? "Load failed"}</p>
          <button
            onClick={() => ai.loadModel()}
            className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-red-400 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/10"
          >
            Retry
          </button>
        </div>
      )}

      {/* Message history — visible at all statuses */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <Bot className="h-8 w-8 text-muted/20" />
            <p className="text-[11px] text-muted/60">
              {(ai.status === "idle" || ai.status === "loading")
                ? "System initializing — you can type your prompt now."
                : "Ask me to create, edit, or explain code."}
              {ai.status === "ready" && activePath
                ? ` I can see your open file: ${activePath}`
                : ""}
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
                    {msg.role === "assistant" ? (
                      <>
                        <MarkdownRenderer
                          content={renderContent(msg)}
                          streaming={msg.streaming}
                        />
                        {msg.streaming && (
                          <span className="inline-block h-3 w-1.5 animate-pulse bg-indigo ml-0.5" />
                        )}
                      </>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-sans">
                        {renderContent(msg)}
                      </pre>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 mt-0.5">
                      <User className="h-3 w-3 text-muted" />
                    </div>
                  )}
                </div>

                {/* File actions — status labels + Reviewing badge */}
                {msg.actions &&
                  !msg.streaming &&
                  msg.actions.map((action) => {
                    const status = msg.actionStatus?.[action.path];
                    const isReviewing =
                      (pendingReview?.messageId === msg.id &&
                        pendingReview.actions.some((a) => a.path === action.path)) ||
                      (isApplyingChanges &&
                        pendingFilePath === action.path &&
                        !msg.actionStatus?.[action.path]);

                    if (status === "accepted") {
                      return (
                        <div
                          key={action.path}
                          className="ml-7 mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400"
                        >
                          <CheckCheck className="h-3 w-3 shrink-0" />
                          <span className="font-mono truncate">{action.path}</span>
                          <span className="shrink-0 text-emerald-400/70">· committed</span>
                        </div>
                      );
                    }
                    if (status === "rejected") {
                      return (
                        <div
                          key={action.path}
                          className="ml-7 mt-1 flex items-center gap-1.5 text-[10px] text-red-400/70"
                        >
                          <X className="h-3 w-3 shrink-0" />
                          <span className="font-mono truncate line-through">{action.path}</span>
                          <span className="shrink-0">· discarded</span>
                        </div>
                      );
                    }
                    if (isReviewing) {
                      return (
                        <div
                          key={action.path}
                          className="ml-7 mt-1 flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1"
                        >
                          <FileClock className="h-3 w-3 shrink-0 text-amber-400" />
                          <span className="font-mono text-[10px] text-foreground/80 truncate">
                            {action.path}
                          </span>
                          <span className="ml-auto shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                            Reviewing…
                          </span>
                        </div>
                      );
                    }
                    // Fallback — shouldn't normally be reached once pendingChange is set
                    return (
                      <div
                        key={action.path}
                        className="ml-7 mt-1 flex items-center gap-1.5 text-[10px] text-muted/50"
                      >
                        <span className="font-mono truncate">{action.path}</span>
                      </div>
                    );
                  })}
              </div>
        ))}
      </div>

      {/* ─── ReviewOverlay — absolute bottom:0, position:relative on parent ─── */}
      <ReviewOverlay
        onApplyFileAction={onApplyFileAction}
        setMessages={setMessages}
      />

      {/* ─── System Initializing bar ─── */}
      {(ai.status === "idle" || ai.status === "loading") && (
        <div className="border-t border-border/30 bg-surface px-3 py-2">
          <div className="mb-1.5 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-indigo/70" />
            <span className="text-[10px] text-muted/70 truncate">
              {ai.loadText || "System initializing…"}
            </span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted/50">
              {Math.round(ai.loadProgress * 100)}%
            </span>
          </div>
          {/* Thin progress bar */}
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-indigo/60 transition-all duration-300"
              style={{ width: `${Math.round(ai.loadProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

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
        {/* Queued prompt indicator */}
        {queuedPrompt && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-indigo/20 bg-indigo/5 px-2.5 py-1.5">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-indigo/60" />
            <span className="truncate text-[10px] text-muted/70">
              Queued: “{queuedPrompt}”
            </span>
            <button
              onClick={() => setQueuedPrompt(null)}
              className="ml-auto shrink-0 text-[10px] text-muted/40 hover:text-muted"
              title="Cancel queued prompt"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingReview
                ? "Review the proposed changes above before continuing…"
                : ai.status === "generating"
                  ? "Generating…"
                  : ai.status === "loading" || ai.status === "idle"
                    ? "Type your prompt — will send once ready…"
                    : "Ask the AI agent…"
            }
            disabled={ai.status === "generating" || !!pendingReview}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder-muted/50 outline-none transition-colors focus:border-indigo disabled:cursor-not-allowed disabled:opacity-40"
            style={{ maxHeight: "80px" }}
          />
          <button
            onClick={() => handleSend()}
            disabled={
              !input.trim() || ai.status === "generating" || !!pendingReview
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
        {ai.modelId && (
          <p className="mt-0.5 text-[9px] text-muted/30 text-center truncate" title={ai.modelId}>
            {modelDisplayName(ai.modelId)}
          </p>
        )}
      </div>
      </div>
    </>
  );
};

export default ChatSidebar;

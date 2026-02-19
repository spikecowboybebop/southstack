/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CHAT SIDEBAR — Threaded AI Chat with conversation history
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Right panel of the IDE. Supports:
 *   • Multiple conversation threads
 *   • Thread list panel (toggle)
 *   • Create / delete / rename threads
 *   • Real-time streaming responses
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatThreadStore } from "../store/chatThreadStore";
import { useAI } from "../hooks/useAI";
import type { ChatMessage } from "../store/aiStore";

export default function ChatSidebar() {
    const {
        currentModel,
        status,
        streamingContent,
        sendMessage: aiSendMessage,
        messages: aiMessages,
        clearChat: aiClearChat,
        loadModel,
    } = useAI();

    const {
        threads,
        activeThreadId,
        threadsPanelOpen,
        createThread,
        deleteThread,
        setActiveThread,
        renameThread,
        addMessageToThread,
        toggleThreadsPanel,
    } = useChatThreadStore();

    const [chatInput, setChatInput] = useState("");
    const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);

    const activeThread = threads.find((t) => t.id === activeThreadId);

    // Sync AI messages to thread
    useEffect(() => {
        if (activeThreadId && aiMessages.length > 0) {
            const thread = useChatThreadStore.getState().threads.find(
                (t) => t.id === activeThreadId
            );
            if (thread && aiMessages.length > thread.messages.length) {
                const newMsgs = aiMessages.slice(thread.messages.length);
                for (const msg of newMsgs) {
                    addMessageToThread(activeThreadId, msg);
                }
            }
        }
    }, [aiMessages, activeThreadId, addMessageToThread]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeThread?.messages, streamingContent]);

    const handleSend = useCallback(() => {
        const trimmed = chatInput.trim();
        if (!trimmed || status !== "ready") return;
        aiSendMessage(trimmed);
        setChatInput("");
    }, [chatInput, status, aiSendMessage]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    const handleNewThread = useCallback(() => {
        createThread();
        aiClearChat();
    }, [createThread, aiClearChat]);

    const handleSwitchThread = useCallback(
        (id: string) => {
            setActiveThread(id);
            aiClearChat();
        },
        [setActiveThread, aiClearChat]
    );

    const handleDeleteThread = useCallback(
        (e: React.MouseEvent, id: string) => {
            e.stopPropagation();
            deleteThread(id);
        },
        [deleteThread]
    );

    const handleRenameStart = useCallback(
        (e: React.MouseEvent, id: string, title: string) => {
            e.stopPropagation();
            setEditingThreadId(id);
            setEditingTitle(title);
        },
        []
    );

    const handleRenameConfirm = useCallback(() => {
        if (editingThreadId && editingTitle.trim()) {
            renameThread(editingThreadId, editingTitle.trim());
        }
        setEditingThreadId(null);
        setEditingTitle("");
    }, [editingThreadId, editingTitle, renameThread]);

    const displayMessages = activeThread?.messages ?? [];

    return (
        <div className="chat-sidebar">
            {/* Chat header */}
            <div className="chat-sidebar-header">
                <div className="chat-sidebar-header-left">
                    <button
                        className="chat-threads-toggle"
                        onClick={toggleThreadsPanel}
                        title="Toggle threads"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>
                    <span className="chat-sidebar-title">
                        AI Chat
                    </span>
                    {status === "generating" && (
                        <span className="typing-indicator">thinking…</span>
                    )}
                </div>
                <div className="chat-sidebar-header-right">
                    <button
                        className="chat-new-thread-btn"
                        onClick={handleNewThread}
                        title="New conversation"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="chat-sidebar-body">
                {/* Thread list panel */}
                {threadsPanelOpen && (
                    <div className="chat-threads-panel">
                        <div className="chat-threads-panel-header">
                            <span>Conversations</span>
                        </div>
                        <div className="chat-threads-list">
                            {threads.map((thread) => (
                                <div
                                    key={thread.id}
                                    className={`chat-thread-item ${thread.id === activeThreadId ? "chat-thread-item-active" : ""
                                        }`}
                                    onClick={() => handleSwitchThread(thread.id)}
                                >
                                    {editingThreadId === thread.id ? (
                                        <input
                                            className="chat-thread-rename-input"
                                            value={editingTitle}
                                            onChange={(e) => setEditingTitle(e.target.value)}
                                            onBlur={handleRenameConfirm}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleRenameConfirm();
                                                if (e.key === "Escape") setEditingThreadId(null);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <div className="chat-thread-item-content">
                                                <span className="chat-thread-item-icon">💬</span>
                                                <span className="chat-thread-item-title">{thread.title}</span>
                                            </div>
                                            <div className="chat-thread-item-actions">
                                                <button
                                                    className="chat-thread-action"
                                                    onClick={(e) => handleRenameStart(e, thread.id, thread.title)}
                                                    title="Rename"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="chat-thread-action"
                                                    onClick={(e) => handleDeleteThread(e, thread.id)}
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Messages area */}
                <div className="chat-messages">
                    {displayMessages.length === 0 && !streamingContent && (
                        <div className="chat-empty">
                            <div className="chat-empty-icon">🤖</div>
                            {status === "idle" ? (
                                <>
                                    <p>Load an AI model to start chatting.</p>
                                    <button
                                        className="ide-model-load-btn"
                                        style={{ marginTop: "12px" }}
                                        onClick={() => loadModel()}
                                    >
                                        Load {currentModel.label}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p>Ask the AI anything about your code.</p>
                                    <p className="muted">
                                        Model: <strong>{currentModel.label}</strong>
                                    </p>
                                    <p className="muted">{currentModel.description}</p>
                                </>
                            )}
                        </div>
                    )}

                    {displayMessages.map((msg: ChatMessage, i: number) => (
                        <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                            <div className="chat-msg-header">
                                <span className="chat-msg-avatar">
                                    {msg.role === "user" ? "👤" : "🤖"}
                                </span>
                                <span className="chat-msg-role">
                                    {msg.role === "user" ? "You" : "AI"}
                                </span>
                            </div>
                            <div className="chat-msg-content">{msg.content}</div>
                        </div>
                    ))}

                    {streamingContent && (
                        <div className="chat-msg chat-msg-assistant">
                            <div className="chat-msg-header">
                                <span className="chat-msg-avatar">🤖</span>
                                <span className="chat-msg-role">AI</span>
                            </div>
                            <div className="chat-msg-content streaming">
                                {streamingContent}
                                <span className="cursor-blink">▌</span>
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>
            </div>

            {/* Input area */}
            <div className="chat-input-area">
                <textarea
                    className="chat-input"
                    placeholder={
                        status === "ready"
                            ? "Ask the AI…  (Enter to send)"
                            : status === "loading"
                                ? "Waiting for model…"
                                : "…"
                    }
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={status !== "ready"}
                    rows={2}
                />
                <button
                    className="btn btn-send"
                    onClick={handleSend}
                    disabled={status !== "ready" || !chatInput.trim()}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

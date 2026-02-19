/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CHAT THREAD STORE — Zustand Store  (src/store/chatThreadStore.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages multiple AI conversation threads.
 * Each thread has its own message history, so users can maintain
 * separate conversations and switch between them.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { create } from "zustand";
import type { ChatMessage } from "./aiStore";

export interface ChatThread {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface ChatThreadState {
    threads: ChatThread[];
    activeThreadId: string | null;
    threadsPanelOpen: boolean;

    // Actions
    createThread: (title?: string) => ChatThread;
    deleteThread: (id: string) => void;
    setActiveThread: (id: string) => void;
    renameThread: (id: string, title: string) => void;
    addMessageToThread: (threadId: string, message: ChatMessage) => void;
    updateThreadMessages: (threadId: string, messages: ChatMessage[]) => void;
    toggleThreadsPanel: () => void;
    getActiveThread: () => ChatThread | null;
}

export const useChatThreadStore = create<ChatThreadState>((set, get) => {
    // Create a default thread on initialization
    const defaultThread: ChatThread = {
        id: crypto.randomUUID(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    return {
        threads: [defaultThread],
        activeThreadId: defaultThread.id,
        threadsPanelOpen: false,

        createThread: (title) => {
            const thread: ChatThread = {
                id: crypto.randomUUID(),
                title: title ?? `Chat ${get().threads.length + 1}`,
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            set((state) => ({
                threads: [thread, ...state.threads],
                activeThreadId: thread.id,
            }));
            return thread;
        },

        deleteThread: (id) => {
            const state = get();
            const remaining = state.threads.filter((t) => t.id !== id);

            if (remaining.length === 0) {
                // Always keep at least one thread
                const newThread: ChatThread = {
                    id: crypto.randomUUID(),
                    title: "New Chat",
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                set({ threads: [newThread], activeThreadId: newThread.id });
            } else {
                set({
                    threads: remaining,
                    activeThreadId:
                        state.activeThreadId === id ? remaining[0].id : state.activeThreadId,
                });
            }
        },

        setActiveThread: (id) => {
            set({ activeThreadId: id });
        },

        renameThread: (id, title) => {
            set((state) => ({
                threads: state.threads.map((t) =>
                    t.id === id ? { ...t, title, updatedAt: Date.now() } : t
                ),
            }));
        },

        addMessageToThread: (threadId, message) => {
            set((state) => ({
                threads: state.threads.map((t) =>
                    t.id === threadId
                        ? {
                            ...t,
                            messages: [...t.messages, message],
                            updatedAt: Date.now(),
                            // Auto-title from first user message
                            title:
                                t.messages.length === 0 && message.role === "user"
                                    ? message.content.slice(0, 40) + (message.content.length > 40 ? "…" : "")
                                    : t.title,
                        }
                        : t
                ),
            }));
        },

        updateThreadMessages: (threadId, messages) => {
            set((state) => ({
                threads: state.threads.map((t) =>
                    t.id === threadId ? { ...t, messages, updatedAt: Date.now() } : t
                ),
            }));
        },

        toggleThreadsPanel: () => {
            set((state) => ({ threadsPanelOpen: !state.threadsPanelOpen }));
        },

        getActiveThread: () => {
            const state = get();
            return state.threads.find((t) => t.id === state.activeThreadId) ?? null;
        },
    };
});

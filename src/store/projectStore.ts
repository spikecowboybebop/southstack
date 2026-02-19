/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROJECT STORE — Zustand Store  (src/store/projectStore.ts)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages user projects for the Dashboard view.
 * Projects are persisted in localStorage per-user so they survive refreshes
 * (but not logouts, since session is volatile).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { create } from "zustand";

export interface Project {
    id: string;
    name: string;
    description: string;
    lastEdited: number;
    createdAt: number;
    icon: string;
}

export interface ProjectState {
    projects: Project[];
    activeProjectId: string | null;

    // Actions
    loadProjects: (userId: string) => void;
    createProject: (userId: string, name: string, description?: string) => Project;
    openProject: (id: string) => void;
    updateProjectTimestamp: (id: string, userId: string) => void;
    deleteProject: (id: string, userId: string) => void;
    closeProject: () => void;
}

const PROJECT_ICONS = ["🚀", "⚡", "🔮", "🎯", "💎", "🌊", "🔥", "✨", "🎨", "🛠️"];

function getStorageKey(userId: string) {
    return `southstack-projects-${userId}`;
}

function persistProjects(userId: string, projects: Project[]) {
    try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(projects));
    } catch {
        // localStorage might be full or unavailable
    }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
    projects: [],
    activeProjectId: null,

    loadProjects: (userId) => {
        try {
            const raw = localStorage.getItem(getStorageKey(userId));
            if (raw) {
                const projects = JSON.parse(raw) as Project[];
                set({ projects: projects.sort((a, b) => b.lastEdited - a.lastEdited) });
            } else {
                set({ projects: [] });
            }
        } catch {
            set({ projects: [] });
        }
    },

    createProject: (userId, name, description = "") => {
        const project: Project = {
            id: crypto.randomUUID(),
            name,
            description,
            lastEdited: Date.now(),
            createdAt: Date.now(),
            icon: PROJECT_ICONS[Math.floor(Math.random() * PROJECT_ICONS.length)],
        };
        const updated = [project, ...get().projects];
        set({ projects: updated, activeProjectId: project.id });
        persistProjects(userId, updated);
        return project;
    },

    openProject: (id) => {
        set({ activeProjectId: id });
    },

    updateProjectTimestamp: (id, userId) => {
        const projects = get().projects.map((p) =>
            p.id === id ? { ...p, lastEdited: Date.now() } : p
        );
        set({ projects: projects.sort((a, b) => b.lastEdited - a.lastEdited) });
        persistProjects(userId, projects);
    },

    deleteProject: (id, userId) => {
        const projects = get().projects.filter((p) => p.id !== id);
        set({
            projects,
            activeProjectId: get().activeProjectId === id ? null : get().activeProjectId,
        });
        persistProjects(userId, projects);
    },

    closeProject: () => {
        set({ activeProjectId: null });
    },
}));

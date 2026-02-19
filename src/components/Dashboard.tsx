/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DASHBOARD — "What are we building today?"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Clean, centered command bar with project cards grid.
 * Shown after authentication, before entering the IDE.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useProjectStore, type Project } from "../store/projectStore";
import { useThemeStore } from "../store/themeStore";

interface DashboardProps {
    userId: string;
    onOpenProject: (project: Project) => void;
    onLogout: () => Promise<void>;
}

export default function Dashboard({ userId, onOpenProject, onLogout }: DashboardProps) {
    const { projects, loadProjects, createProject, deleteProject } = useProjectStore();
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);
    const [commandValue, setCommandValue] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadProjects(userId);
    }, [userId, loadProjects]);

    // Focus input on mount
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    }, []);

    const handleCreate = useCallback(() => {
        const name = commandValue.trim();
        if (!name) return;
        setIsCreating(true);
        const project = createProject(userId, name);
        setCommandValue("");
        setIsCreating(false);
        onOpenProject(project);
    }, [commandValue, createProject, userId, onOpenProject]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
            }
        },
        [handleCreate]
    );

    const handleDelete = useCallback(
        (e: React.MouseEvent, id: string) => {
            e.stopPropagation();
            if (confirm("Delete this project?")) {
                deleteProject(id, userId);
            }
        },
        [deleteProject, userId]
    );

    const formatTimeAgo = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div className="dashboard">
            {/* Background ambient effects */}
            <div className="dashboard-bg">
                <div className="dashboard-glow dashboard-glow-1" />
                <div className="dashboard-glow dashboard-glow-2" />
                <div className="dashboard-glow dashboard-glow-3" />
            </div>

            {/* Top bar */}
            <header className="dashboard-header">
                <div className="dashboard-header-left">
                    <span className="dashboard-logo">⚡ SouthStack</span>
                </div>
                <div className="dashboard-header-right">
                    <button
                        className="dashboard-theme-btn"
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
                    <span className="dashboard-user-avatar" title={userId}>
                        {userId.charAt(0).toUpperCase()}
                    </span>
                    <span className="dashboard-username">{userId}</span>
                    <button className="btn btn-logout" onClick={onLogout}>
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Main content */}
            <main className="dashboard-main">
                {/* Hero section with command bar */}
                <div className="dashboard-hero">
                    <h1 className="dashboard-title">
                        What are we building <span className="dashboard-title-accent">today</span>?
                    </h1>
                    <p className="dashboard-subtitle">
                        Create a new project or open an existing one to get started.
                    </p>

                    <div className="dashboard-command-bar">
                        <div className="dashboard-command-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="16" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                        </div>
                        <input
                            ref={inputRef}
                            className="dashboard-command-input"
                            type="text"
                            placeholder="Name your new project…"
                            value={commandValue}
                            onChange={(e) => setCommandValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isCreating}
                        />
                        <button
                            className="dashboard-command-btn"
                            onClick={handleCreate}
                            disabled={!commandValue.trim() || isCreating}
                        >
                            Create Project
                            <span className="dashboard-command-shortcut">↵</span>
                        </button>
                    </div>
                </div>

                {/* Project cards grid */}
                {projects.length > 0 && (
                    <section className="dashboard-projects">
                        <h2 className="dashboard-section-title">Recent Projects</h2>
                        <div className="dashboard-grid">
                            {projects.map((project) => (
                                <button
                                    key={project.id}
                                    className="project-card"
                                    onClick={() => onOpenProject(project)}
                                >
                                    <div className="project-card-header">
                                        <span className="project-card-icon">{project.icon}</span>
                                        <button
                                            className="project-card-delete"
                                            onClick={(e) => handleDelete(e, project.id)}
                                            title="Delete project"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <h3 className="project-card-name">{project.name}</h3>
                                    {project.description && (
                                        <p className="project-card-desc">{project.description}</p>
                                    )}
                                    <div className="project-card-footer">
                                        <span className="project-card-time">
                                            {formatTimeAgo(project.lastEdited)}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Empty state */}
                {projects.length === 0 && (
                    <div className="dashboard-empty">
                        <div className="dashboard-empty-icon">📂</div>
                        <p className="dashboard-empty-text">
                            No projects yet. Name one above and hit Enter to get started.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

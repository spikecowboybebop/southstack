"use client";

/**
 * /dashboard — Protected project dashboard.
 *
 * Lists all projects from IndexedDB, provides create/open/delete actions.
 * Redirects to /login if unauthenticated.
 */

import {
    createProject,
    deleteProject,
    getAllProjects,
    type Project,
} from "@/lib/projects";
import {
    Clock,
    FileCode,
    FolderOpen,
    LayoutGrid,
    LogOut,
    Plus,
    Search,
    Terminal,
    Trash2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import NewProjectModal from "../components/NewProjectModal";

// ─── Language badge colors ──────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  typescript: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  javascript: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  python: "bg-green-500/10 text-green-400 border-green-500/20",
  html: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  css: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const LANG_LABELS: Record<string, string> = {
  typescript: "TS",
  javascript: "JS",
  python: "PY",
  html: "HTML",
  css: "CSS",
};

// ─── Relative time helper ───────────────────────────────────

function timeAgo(isoDate: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Component ──────────────────────────────────────────────

export default function DashboardPage() {
  const { user, isLoggedIn, mounted, logout } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Route protection ──
  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.replace("/login");
    }
  }, [mounted, isLoggedIn, router]);

  // ── Load projects from IndexedDB ──
  const loadProjects = useCallback(async () => {
    try {
      const list = await getAllProjects();
      setProjects(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (mounted && isLoggedIn) {
      loadProjects();
    }
  }, [mounted, isLoggedIn, loadProjects]);

  // ── Create project handler ──
  async function handleCreate(name: string, language: string) {
    const project = await createProject(name, language);
    router.push(`/editor/${project.id}`);
  }

  // ── Delete project handler ──
  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project:", err);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Auth guard ──
  if (!mounted || !isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
      </div>
    );
  }

  // ── Filtered projects ──
  const filtered = searchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo text-white">
              <Terminal className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              SouthStack
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:block">
              {user}
            </span>
            <button
              onClick={() => {
                logout();
                router.replace("/");
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border-light bg-surface px-3 py-2 text-sm text-muted transition-all hover:border-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* ── Welcome header ── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Welcome back, <span className="text-indigo">{user}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {projects.length === 0
                ? "Create your first project to get started."
                : `You have ${projects.length} project${projects.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 self-start rounded-lg bg-indigo px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-light hover:shadow-lg hover:shadow-indigo-glow sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {/* ── Search bar (only if projects exist) ── */}
        {projects.length > 0 && (
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search projects…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border-light bg-surface py-2.5 pr-4 pl-11 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-indigo focus:ring-1 focus:ring-indigo sm:max-w-sm"
            />
          </div>
        )}

        {/* ── Loading skeletons ── */}
        {isLoadingProjects ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-border bg-surface p-6"
              >
                <div className="mb-4 h-5 w-3/4 rounded bg-border" />
                <div className="mb-3 h-3 w-1/2 rounded bg-border" />
                <div className="h-3 w-1/3 rounded bg-border" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && searchQuery ? (
          /* ── No search results ── */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="mb-4 h-12 w-12 text-muted/30" />
            <h2 className="text-lg font-semibold text-foreground">
              No projects match &ldquo;{searchQuery}&rdquo;
            </h2>
            <p className="mt-1 text-sm text-muted">Try a different search term.</p>
          </div>
        ) : projects.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-light py-24 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo/10 text-indigo">
              <LayoutGrid className="h-10 w-10" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-foreground">
              No projects yet
            </h2>
            <p className="mb-8 max-w-sm text-sm text-muted">
              Create your first project and start coding offline. Everything is
              stored locally on your device.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-light hover:shadow-lg hover:shadow-indigo-glow"
            >
              <Plus className="h-4 w-4" />
              Create Your First Project
            </button>
          </div>
        ) : (
          /* ── Project grid ── */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-surface transition-all hover:border-border-light hover:bg-surface-light hover:shadow-lg hover:shadow-indigo-glow/50"
              >
                {/* Card body — clickable */}
                <Link
                  href={`/editor/${project.id}`}
                  className="flex flex-1 flex-col p-6"
                >
                  {/* Top row: icon + language badge */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo/10 text-indigo transition-colors group-hover:bg-indigo/20">
                      <FileCode className="h-5 w-5" />
                    </div>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        LANG_COLORS[project.language] ??
                        "bg-muted/10 text-muted border-muted/20"
                      }`}
                    >
                      {LANG_LABELS[project.language] ?? project.language}
                    </span>
                  </div>

                  {/* Name */}
                  <h3 className="mb-1.5 text-base font-semibold text-foreground line-clamp-1">
                    {project.name}
                  </h3>

                  {/* Last modified */}
                  <div className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-muted">
                    <Clock className="h-3 w-3" />
                    Last edited {timeAgo(project.lastModified)}
                  </div>
                </Link>

                {/* Action row */}
                <div className="flex items-center justify-between border-t border-border px-6 py-3">
                  <Link
                    href={`/editor/${project.id}`}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo transition-colors hover:text-indigo-light"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Open
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(project.id);
                    }}
                    disabled={deletingId === project.id}
                    className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-red-400 disabled:opacity-50"
                    title="Delete project"
                  >
                    {deletingId === project.id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-muted border-t-transparent" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {/* New project card (always last) */}
            <button
              onClick={() => setModalOpen(true)}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-light p-6 text-muted transition-all hover:border-indigo/40 hover:bg-surface-light hover:text-foreground"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo/10 text-indigo">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">New Project</span>
            </button>
          </div>
        )}
      </main>

      {/* ── Create Modal ── */}
      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

"use client";

import { Code2, Terminal, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../components/AuthProvider";

/**
 * /editor — Protected route.
 * Redirects to /login if not authenticated.
 * Placeholder editor page for now.
 */
export default function EditorPage() {
  const { user, isLoggedIn, mounted, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.replace("/login");
    }
  }, [mounted, isLoggedIn, router]);

  // Loading / redirect state
  if (!mounted || !isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Editor top bar */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo text-white">
            <Terminal className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-foreground">SouthStack</span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <WifiOff className="h-3 w-3" />
            Offline Ready
          </span>
          <span className="text-xs text-muted">
            Signed in as <span className="text-foreground font-medium">{user}</span>
          </span>
          <button
            onClick={() => {
              logout();
              router.replace("/");
            }}
            className="rounded-md border border-border-light px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Placeholder editor area */}
      <main className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo/10 text-indigo">
            <Code2 className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Editor Coming Soon</h1>
          <p className="max-w-md text-sm text-muted">
            The full offline code editor is under development. This is your authenticated workspace —
            you&apos;re all set to start building.
          </p>
          <Link
            href="/"
            className="mt-4 text-sm text-indigo transition-colors hover:text-indigo-light"
          >
            ← Back to landing page
          </Link>
        </div>
      </main>
    </div>
  );
}

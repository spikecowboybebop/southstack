"use client";

import { LogOut, Sparkles, Terminal, User } from "lucide-react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export default function Navbar() {
  const { user, isLoggedIn, mounted, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo text-white">
            <Terminal className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            SouthStack
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="/#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="/#how-it-works" className="transition-colors hover:text-foreground">
            How it Works
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>

        {/* Right side — auth-aware buttons */}
        <div className="flex items-center gap-3">
          {/* 
            Hydration guard: render nothing auth-dependent until
            the client has mounted, preventing server/client mismatch.
          */}
          {!mounted ? (
            /* Invisible placeholder keeps layout stable during SSR */
            <div className="h-9 w-[180px]" />
          ) : isLoggedIn ? (
            <>
              {/* Authenticated: username + logout + Launch Editor */}
              <span className="hidden items-center gap-1.5 text-sm text-muted sm:flex">
                <User className="h-3.5 w-3.5" />
                {user}
              </span>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 rounded-lg border border-border-light bg-surface px-3 py-2 text-sm text-muted transition-all hover:border-muted hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
              <Link
                href="/dashboard"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-indigo via-indigo-light to-indigo px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-glow transition-all hover:shadow-xl hover:shadow-indigo-glow-strong hover:brightness-110"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Dashboard
                {/* Animated shimmer overlay */}
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </Link>
            </>
          ) : (
            <>
              {/* Unauthenticated: Login + Sign Up */}
              <Link
                href="/login"
                className="rounded-lg border border-border-light bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-muted hover:bg-surface-light"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-indigo px-4 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-light hover:shadow-lg hover:shadow-indigo-glow"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

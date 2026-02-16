"use client";

import { ArrowRight, Github, Sparkles } from "lucide-react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export default function Hero() {
  const { isLoggedIn, mounted } = useAuth();

  return (
    <section className="relative flex flex-col items-center px-6 pt-40 pb-20 text-center">
      <div className="hero-glow" />

      {/* Badge */}
      <div className="relative z-10 mb-8 inline-flex items-center gap-2 rounded-full border border-border-light bg-surface/60 px-4 py-1.5 text-sm text-muted backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        Now available as a PWA
      </div>

      {/* Headline */}
      <h1 className="relative z-10 max-w-3xl text-5xl leading-[1.1] font-bold tracking-tight text-foreground md:text-7xl">
        Code Anywhere,{" "}
        <span className="bg-gradient-to-r from-indigo to-indigo-light bg-clip-text text-transparent">
          Even Offline.
        </span>
      </h1>

      {/* Sub-headline */}
      <p className="relative z-10 mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl">
        A privacy-first, browser-based code editor with zero latency.
        Your code stays on your machine — always.
      </p>

      {/* CTAs — hydration-safe */}
      <div className="relative z-10 mt-10 flex flex-col items-center gap-4 sm:flex-row">
        {!mounted ? (
          /* Stable placeholder during SSR — prevents layout shift */
          <div className="h-[52px] w-[196px] rounded-xl bg-indigo/20" />
        ) : isLoggedIn ? (
          /* ── Authenticated CTA ── */
          <Link
            href="/editor"
            className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-indigo via-indigo-light to-indigo px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-indigo-glow transition-all hover:shadow-2xl hover:shadow-indigo-glow-strong hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" />
            Resume Coding
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            {/* Shimmer sweep */}
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Link>
        ) : (
          /* ── Unauthenticated CTA ── */
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-xl bg-indigo px-7 py-3.5 text-base font-semibold text-white transition-all hover:bg-indigo-light hover:shadow-xl hover:shadow-indigo-glow"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-surface px-7 py-3.5 text-base font-medium text-foreground transition-all hover:border-muted hover:bg-surface-light"
        >
          <Github className="h-4 w-4" />
          View on GitHub
        </a>
      </div>
    </section>
  );
}

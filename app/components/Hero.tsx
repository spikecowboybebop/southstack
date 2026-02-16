import { ArrowRight, Github } from "lucide-react";

export default function Hero() {
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

      {/* CTAs */}
      <div className="relative z-10 mt-10 flex flex-col items-center gap-4 sm:flex-row">
        <a
          href="#"
          className="group inline-flex items-center gap-2 rounded-xl bg-indigo px-7 py-3.5 text-base font-semibold text-white transition-all hover:bg-indigo-light hover:shadow-xl hover:shadow-indigo-glow"
        >
          Launch Editor
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
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

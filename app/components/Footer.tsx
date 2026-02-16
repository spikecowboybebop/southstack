import { Terminal } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface/50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-12 md:flex-row md:justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo text-white">
            <Terminal className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-foreground">SouthStack</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-sm text-muted">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
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
          <a href="#" className="transition-colors hover:text-foreground">
            Docs
          </a>
        </div>

        {/* Credit */}
        <p className="text-xs text-muted/60">
          Built by <span className="text-muted">SouthStack Team</span> · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

import { Terminal } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo text-white">
            <Terminal className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            SouthStack
          </span>
        </div>

        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
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
        </div>

        <a
          href="#"
          className="rounded-lg bg-indigo px-4 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-light hover:shadow-lg hover:shadow-indigo-glow"
        >
          Launch Editor
        </a>
      </div>
    </nav>
  );
}

"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

const LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, language: string) => Promise<void>;
}

export default function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the name input when the modal opens
  useEffect(() => {
    if (open) {
      setName("");
      setLanguage("typescript");
      setIsCreating(false);
      // Small delay to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await onCreate(name.trim(), language);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-2xl shadow-black/40">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-1 text-xl font-bold text-foreground">New Project</h2>
        <p className="mb-6 text-sm text-muted">
          Give your project a name and pick a language to get started.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Project Name */}
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Project Name
          </label>
          <input
            ref={inputRef}
            type="text"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my-cool-app"
            className="mb-5 w-full rounded-lg border border-border-light bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-indigo focus:ring-1 focus:ring-indigo"
          />

          {/* Language */}
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Language
          </label>
          <div className="mb-6 flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => setLanguage(lang.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
                  language === lang.value
                    ? "border-indigo bg-indigo/10 text-indigo"
                    : "border-border-light bg-background text-muted hover:border-muted hover:text-foreground"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-light px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="flex items-center gap-2 rounded-lg bg-indigo px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-light hover:shadow-lg hover:shadow-indigo-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create Project"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

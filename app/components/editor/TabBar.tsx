"use client";

import { File, X } from "lucide-react";

// ─── File icon colour (mirrors Sidebar logic) ───────────────

function fileIconColour(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    py: "text-green-400",
    html: "text-orange-400",
    css: "text-pink-400",
    scss: "text-pink-400",
    json: "text-amber-400",
    md: "text-gray-400",
    yaml: "text-red-400",
    yml: "text-red-400",
  };
  return map[ext ?? ""] ?? "text-muted";
}

// ─── Types ───────────────────────────────────────────────────

export interface TabItem {
  path: string;
  /** Has unsaved changes. */
  dirty?: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

// ─── Component ──────────────────────────────────────────────

export default function TabBar({
  tabs,
  activePath,
  onSelect,
  onClose,
}: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center overflow-x-auto border-b border-border bg-surface">
      {tabs.map((tab) => {
        const fileName = tab.path.split("/").pop() ?? tab.path;
        const isActive = tab.path === activePath;

        return (
          <div
            key={tab.path}
            className={`group flex items-center gap-1.5 cursor-pointer border-r border-border px-3 py-1.5 text-[13px] transition-colors select-none ${
              isActive
                ? "bg-background text-foreground border-b-2 border-b-indigo"
                : "text-muted hover:text-foreground/80 hover:bg-white/[0.02]"
            }`}
            onClick={() => onSelect(tab.path)}
          >
            <File
              className={`h-3.5 w-3.5 shrink-0 ${fileIconColour(fileName)}`}
            />
            <span className="truncate max-w-[140px]">{fileName}</span>

            {tab.dirty && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-indigo shrink-0" />
            )}

            <button
              className={`ml-1 rounded p-0.5 transition-colors ${
                isActive
                  ? "text-muted hover:text-foreground hover:bg-white/10"
                  : "text-transparent group-hover:text-muted hover:!text-foreground hover:bg-white/10"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              title="Close tab"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

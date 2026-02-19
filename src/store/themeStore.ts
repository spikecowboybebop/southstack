/**
 * Theme Store — persists dark/light preference to localStorage
 * and applies `data-theme` attribute to the <html> element.
 */

import { create } from "zustand";

export type Theme = "dark" | "light";

interface ThemeState {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
}

/** Read saved preference or fall back to "dark". */
function getInitialTheme(): Theme {
    try {
        const saved = localStorage.getItem("southstack-theme");
        if (saved === "light" || saved === "dark") return saved;
    } catch {
        // localStorage unavailable
    }
    return "dark";
}

/** Apply `data-theme` attribute so CSS variables cascade. */
function applyTheme(theme: Theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("southstack-theme", theme);
}

// Apply on load immediately (before React renders) to prevent flash
const initial = getInitialTheme();
applyTheme(initial);

export const useThemeStore = create<ThemeState>((set) => ({
    theme: initial,
    setTheme: (t) => {
        applyTheme(t);
        set({ theme: t });
    },
    toggleTheme: () =>
        set((state) => {
            const next = state.theme === "dark" ? "light" : "dark";
            applyTheme(next);
            return { theme: next };
        }),
}));

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FILE ICONS — Maps file extensions to SVG icons and colors
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each extension gets a unique color and short label (rendered as a mini SVG).
 * Folders get a folder icon. Unknown extensions get a generic file icon.
 *
 * These are inline SVG data URIs so we need ZERO external dependencies or
 * icon font downloads — works fully offline.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export interface FileIconInfo {
  /** Short label shown inside the icon (e.g. "TS", "JS") */
  label: string;
  /** Primary color for the icon */
  color: string;
  /** Secondary/background tint */
  bgColor: string;
}

// ── Extension → icon mapping ────────────────────────────────────────────────

const EXT_MAP: Record<string, FileIconInfo> = {
  // JavaScript / TypeScript
  js:   { label: "JS",   color: "#f7df1e", bgColor: "#f7df1e22" },
  jsx:  { label: "JSX",  color: "#61dafb", bgColor: "#61dafb22" },
  ts:   { label: "TS",   color: "#3178c6", bgColor: "#3178c622" },
  tsx:  { label: "TSX",  color: "#3178c6", bgColor: "#3178c622" },
  mjs:  { label: "MJS",  color: "#f7df1e", bgColor: "#f7df1e22" },
  cjs:  { label: "CJS",  color: "#f7df1e", bgColor: "#f7df1e22" },

  // Web
  html: { label: "HTML", color: "#e34c26", bgColor: "#e34c2622" },
  htm:  { label: "HTM",  color: "#e34c26", bgColor: "#e34c2622" },
  css:  { label: "CSS",  color: "#264de4", bgColor: "#264de422" },
  scss: { label: "SCSS", color: "#cc6699", bgColor: "#cc669922" },
  sass: { label: "SASS", color: "#cc6699", bgColor: "#cc669922" },
  less: { label: "LESS", color: "#1d365d", bgColor: "#1d365d22" },
  svg:  { label: "SVG",  color: "#ffb13b", bgColor: "#ffb13b22" },

  // Data / Config
  json: { label: "{ }",  color: "#a8b1ff", bgColor: "#a8b1ff22" },
  yaml: { label: "YML",  color: "#cb171e", bgColor: "#cb171e22" },
  yml:  { label: "YML",  color: "#cb171e", bgColor: "#cb171e22" },
  toml: { label: "TOML", color: "#9c4121", bgColor: "#9c412122" },
  xml:  { label: "XML",  color: "#f16529", bgColor: "#f1652922" },
  csv:  { label: "CSV",  color: "#22a162", bgColor: "#22a16222" },
  env:  { label: "ENV",  color: "#ecd53f", bgColor: "#ecd53f22" },

  // Python
  py:   { label: "PY",   color: "#3572a5", bgColor: "#3572a522" },
  pyw:  { label: "PY",   color: "#3572a5", bgColor: "#3572a522" },
  ipynb:{ label: "NB",   color: "#f37626", bgColor: "#f3762622" },

  // Rust / Go / C / C++ / Java
  rs:   { label: "RS",   color: "#dea584", bgColor: "#dea58422" },
  go:   { label: "GO",   color: "#00add8", bgColor: "#00add822" },
  c:    { label: "C",    color: "#555555", bgColor: "#55555522" },
  h:    { label: "H",    color: "#555555", bgColor: "#55555522" },
  cpp:  { label: "C++",  color: "#00599c", bgColor: "#00599c22" },
  hpp:  { label: "H++",  color: "#00599c", bgColor: "#00599c22" },
  java: { label: "JAVA", color: "#b07219", bgColor: "#b0721922" },
  kt:   { label: "KT",   color: "#a97bff", bgColor: "#a97bff22" },
  swift:{ label: "SW",   color: "#f05138", bgColor: "#f0513822" },
  rb:   { label: "RB",   color: "#cc342d", bgColor: "#cc342d22" },
  php:  { label: "PHP",  color: "#777bb4", bgColor: "#777bb422" },

  // Shell
  sh:   { label: "SH",   color: "#89e051", bgColor: "#89e05122" },
  bash: { label: "SH",   color: "#89e051", bgColor: "#89e05122" },
  zsh:  { label: "ZSH",  color: "#89e051", bgColor: "#89e05122" },
  ps1:  { label: "PS1",  color: "#012456", bgColor: "#01245622" },
  bat:  { label: "BAT",  color: "#c1f12e", bgColor: "#c1f12e22" },
  cmd:  { label: "CMD",  color: "#c1f12e", bgColor: "#c1f12e22" },

  // Docs
  md:   { label: "MD",   color: "#083fa1", bgColor: "#083fa122" },
  mdx:  { label: "MDX",  color: "#fcb32c", bgColor: "#fcb32c22" },
  txt:  { label: "TXT",  color: "#94a3b8", bgColor: "#94a3b822" },
  log:  { label: "LOG",  color: "#94a3b8", bgColor: "#94a3b822" },
  pdf:  { label: "PDF",  color: "#e34c26", bgColor: "#e34c2622" },

  // Images
  png:  { label: "PNG",  color: "#a562f7", bgColor: "#a562f722" },
  jpg:  { label: "JPG",  color: "#a562f7", bgColor: "#a562f722" },
  jpeg: { label: "JPG",  color: "#a562f7", bgColor: "#a562f722" },
  gif:  { label: "GIF",  color: "#a562f7", bgColor: "#a562f722" },
  webp: { label: "WEBP", color: "#a562f7", bgColor: "#a562f722" },
  ico:  { label: "ICO",  color: "#a562f7", bgColor: "#a562f722" },

  // Package / Lock
  lock: { label: "LOCK", color: "#94a3b8", bgColor: "#94a3b822" },

  // Docker
  dockerfile: { label: "🐳", color: "#2496ed", bgColor: "#2496ed22" },

  // WASM
  wasm: { label: "WASM", color: "#654ff0", bgColor: "#654ff022" },
  wat:  { label: "WAT",  color: "#654ff0", bgColor: "#654ff022" },
};

// ── Special filenames that override extension-based lookup ───────────────────

const FILENAME_MAP: Record<string, FileIconInfo> = {
  "package.json":      { label: "NPM",  color: "#cb3837", bgColor: "#cb383722" },
  "package-lock.json": { label: "NPM",  color: "#cb3837", bgColor: "#cb383722" },
  "tsconfig.json":     { label: "TS",   color: "#3178c6", bgColor: "#3178c622" },
  "vite.config.ts":    { label: "⚡",   color: "#646cff", bgColor: "#646cff22" },
  "vite.config.js":    { label: "⚡",   color: "#646cff", bgColor: "#646cff22" },
  ".gitignore":        { label: "GIT",  color: "#f14e32", bgColor: "#f14e3222" },
  ".env":              { label: "ENV",  color: "#ecd53f", bgColor: "#ecd53f22" },
  ".env.local":        { label: "ENV",  color: "#ecd53f", bgColor: "#ecd53f22" },
  "Dockerfile":        { label: "🐳",   color: "#2496ed", bgColor: "#2496ed22" },
  "docker-compose.yml":{ label: "🐳",   color: "#2496ed", bgColor: "#2496ed22" },
  "Makefile":          { label: "MAKE", color: "#6d8086", bgColor: "#6d808622" },
  "LICENSE":           { label: "LIC",  color: "#d4aa00", bgColor: "#d4aa0022" },
  "README.md":         { label: "README",color: "#083fa1", bgColor: "#083fa122" },
};

// ── Folder icon ──────────────────────────────────────────────────────────────

export const FOLDER_ICON: FileIconInfo = {
  label: "📁",
  color: "#e8a87c",
  bgColor: "#e8a87c22",
};

export const FOLDER_OPEN_ICON: FileIconInfo = {
  label: "📂",
  color: "#e8a87c",
  bgColor: "#e8a87c22",
};

const DEFAULT_ICON: FileIconInfo = {
  label: "FILE",
  color: "#94a3b8",
  bgColor: "#94a3b822",
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the icon info for a given filename.
 * Checks special filenames first, then falls back to extension lookup.
 */
export function getFileIcon(filename: string): FileIconInfo {
  const lower = filename.toLowerCase();

  // Check special filenames first
  if (FILENAME_MAP[filename]) return FILENAME_MAP[filename];
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower];

  // Extract extension
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) return DEFAULT_ICON;

  const ext = lower.slice(dotIndex + 1);
  return EXT_MAP[ext] ?? DEFAULT_ICON;
}

/**
 * Get the Monaco Editor language identifier for a given filename.
 */
export function getLanguageFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) return "plaintext";

  const ext = lower.slice(dotIndex + 1);

  const langMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    xml: "xml",
    svg: "xml",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rs: "rust",
    go: "go",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    rb: "ruby",
    php: "php",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    bat: "bat",
    cmd: "bat",
    sql: "sql",
    graphql: "graphql",
    dockerfile: "dockerfile",
    toml: "ini",
    txt: "plaintext",
    log: "plaintext",
  };

  return langMap[ext] ?? "plaintext";
}

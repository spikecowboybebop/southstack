/**
 * react-starter-template — Standard React + Vite starter files
 * for WebContainer projects.
 *
 * When a user opens an empty project (or creates a new "React" project),
 * these files are mounted into the WebContainer so that:
 *
 *   1. `npm install` immediately succeeds.
 *   2. `npm run dev` launches a Vite dev server.
 *   3. The user manually saves files and refreshes the preview.
 *
 * The Vite config includes COEP/COOP headers for cross-origin
 * isolation (required by the WebContainer Service Worker proxy).
 */

import type { FileSystemTree } from "@webcontainer/api";

// ─── File Contents ──────────────────────────────────────────

const PACKAGE_JSON = `{
  "name": "react-starter",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0"
  }
}
`;

const VITE_CONFIG_JS = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

const MAIN_JSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const APP_JSX = `import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
      <h1>⚡ React + Vite</h1>
      <p>Edit <code>src/App.jsx</code>, save with <b>Ctrl+S</b>, then refresh the preview.</p>
      <button
        onClick={() => setCount((c) => c + 1)}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "1rem",
          borderRadius: 6,
          border: "1px solid #ccc",
          cursor: "pointer",
          marginTop: "1rem",
        }}
      >
        Count: {count}
      </button>
    </div>
  );
}

export default App;
`;

const INDEX_CSS = `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  color: #e0e0e0;
}

button:hover {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}
`;

// ─── FileSystemTree (WebContainer mount format) ──────────────

/**
 * Complete React + Vite starter as a WebContainer `FileSystemTree`.
 * Ready to be passed to `webcontainerInstance.mount(REACT_STARTER_TEMPLATE)`.
 */
export const REACT_STARTER_TEMPLATE: FileSystemTree = {
  "package.json": {
    file: { contents: PACKAGE_JSON },
  },
  "vite.config.js": {
    file: { contents: VITE_CONFIG_JS },
  },
  "index.html": {
    file: { contents: INDEX_HTML },
  },
  src: {
    directory: {
      "main.jsx": {
        file: { contents: MAIN_JSX },
      },
      "App.jsx": {
        file: { contents: APP_JSX },
      },
      "index.css": {
        file: { contents: INDEX_CSS },
      },
    },
  },
};

/**
 * Flat map of every file in the starter for OPFS seeding.
 * Keys are relative paths (e.g. "src/App.jsx").
 */
export const REACT_STARTER_FILES: Record<string, string> = {
  "package.json": PACKAGE_JSON,
  "vite.config.js": VITE_CONFIG_JS,
  "index.html": INDEX_HTML,
  "src/main.jsx": MAIN_JSX,
  "src/App.jsx": APP_JSX,
  "src/index.css": INDEX_CSS,
};

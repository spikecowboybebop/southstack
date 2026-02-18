# SouthStack — Developer Documentation

> Architecture reference for the SouthStack project. Keep this file updated as the codebase evolves.

---

## 1. Project Overview

SouthStack is an **in-browser AI-powered code editor** that lets users create and iterate on full-stack web projects entirely inside a browser tab. It combines a Monaco-style editor UI with a live **WebContainer** (a Node.js-compatible runtime running in a Service Worker) so that code changes are immediately executed and previewed without any server round-trip. The AI coding agent runs as a **Web Worker** powered by WebLLM (a fully client-side LLM runtime), meaning the language model never sends user code to an external API — all inference happens locally on the user's GPU/CPU.

**Core Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · WebContainers API · WebLLM (in-browser LLM) · Web Crypto API · OPFS (Origin Private File System) · Tailwind CSS v4

---

## 2. Architecture Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser Tab                                  │
│                                                                      │
│  ┌─────────────────────┐        ┌──────────────────────────────────┐ │
│  │   Main UI Thread     │        │        AI Web Worker             │ │
│  │  (Next.js / React)   │◄──────►│  (public/ai-worker.js)          │ │
│  │                      │ postMsg│  • WebLLM model loaded here     │ │
│  │  • Editor UI         │        │  • Streams tokens back to UI    │ │
│  │  • Preview iframe    │        │  • No DOM access                │ │
│  │  • Auth / Sessions   │        └──────────────────────────────────┘ │
│  │                      │                                             │
│  │        │FS sync       │        ┌──────────────────────────────────┐ │
│  │        ▼              │        │      WebContainer Instance        │ │
│  │  ┌───────────────┐   │◄──────►│  (Service Worker / WASM)         │ │
│  │  │  OPFS Layer   │   │  FS ops│  • Runs Node.js in-browser       │ │
│  │  │  (Encrypted)  │   │        │  • npm install / dev server      │ │
│  │  └───────────────┘   │        │  • Exposes localhost preview URL  │ │
│  └─────────────────────┘        └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Lifecycle of a Code Change: User Prompt → WebContainer FS

```
 User types prompt
       │
       ▼
 ai-context.ts        Scrapes OPFS file tree + active file content
       │               into a structured ProjectContext object
       ▼
 ai-engine.ts         Packages context into a system prompt and
       │               sends it to the AI Web Worker via postMessage
       ▼
 ai-worker.js         Receives messages, runs WebLLM inference,
       │               streams raw token chunks back to main thread
       ▼
 ai-parser.ts         Parses streamed output into structured
       │               FileAction objects (FILE: / PATCH: blocks)
       ▼
 ChatSidebar.tsx       Displays a diff/preview of each FileAction
       │               behind the Safety Gate (Keep / Discard)
       ▼
 [User clicks Keep]
       │
       ▼
 opfs.ts / opfs-crypto.ts   Encrypts & persists the new file content
       │                     to OPFS for durable storage
       ▼
 wc-sync-manager.ts   Writes the accepted file content into
       │               webcontainerInstance.fs (in-memory FS)
       ▼
 WebContainer          Vite HMR detects the change, hot-reloads
                        the preview iframe automatically
```

---

## 3. File Directory Guide

### `app/` — Next.js App Router Pages & Components

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Root layout; wraps the app in `AuthProvider`, sets global fonts and metadata |
| `app/page.tsx` | Public landing page; renders Hero, Features, HowItWorks, and Footer sections |
| `app/globals.css` | Global Tailwind base styles and CSS custom properties (brand tokens) |
| `app/dashboard/page.tsx` | Authenticated project list; shows saved projects and the New Project button |
| `app/editor/page.tsx` | Editor redirect/shell; forwards to a specific project route |
| `app/editor/[projectId]/page.tsx` | **Main editor page** — boots WebContainer, mounts all editor panels, owns top-level state |
| `app/login/page.tsx` | Login form; delegates credential validation to `lib/auth.ts` |
| `app/signup/page.tsx` | Sign-up form; creates user record and derives the per-user encryption key |
| `app/test-suite/page.tsx` | Internal developer page for smoke-testing WebContainer behaviour |
| `app/components/AuthGate.tsx` | HOC that redirects unauthenticated users away from protected routes |
| `app/components/AuthProvider.tsx` | React context provider that holds session state and exposes `useAuth()` |
| `app/components/EditorMockup.tsx` | Animated static mockup of the editor used on the landing page hero |
| `app/components/FeaturesGrid.tsx` | Marketing component rendering the feature card grid |
| `app/components/NewProjectModal.tsx` | Modal for naming and creating a new project; calls `lib/projects.ts` |
| `app/components/editor/ChatSidebar.tsx` | **AI chat panel** — streams tokens, buffers output, owns `pendingChanges` Safety Gate state |
| `app/components/editor/DiffView.tsx` | Renders a unified diff for a single FileAction with Accept/Reject buttons |
| `app/components/editor/MarkdownRenderer.tsx` | Rich markdown + syntax-highlighted code block renderer for chat messages |
| `app/components/editor/WebTerminal.tsx` | xterm.js terminal showing WebContainer stdout/stderr; has "Fix with AI" button |

### `lib/` — Core Business Logic & Utilities

| File | Responsibility |
|---|---|
| `lib/ai-context.ts` | Builds `ProjectContext` (file tree + active file) and `formatAgentPrompt()` for the LLM |
| `lib/ai-engine.ts` | Persistent AI engine singleton via React Context; owns the Web Worker ref and streaming callbacks |
| `lib/ai-parser.ts` | Parses raw LLM output into `FileAction[]` (FILE: full rewrites and PATCH: search-replace blocks) |
| `lib/auth.ts` | Server-side auth helpers: password hashing, credential verification, user record CRUD |
| `lib/crypto.ts` | Web Crypto API wrappers for AES-GCM key derivation, encryption, and decryption |
| `lib/db.ts` | Thin database client for user and project metadata (IndexedDB-based) |
| `lib/opfs.ts` | High-level OPFS API: read, write, list, and delete project files in the browser's sandboxed FS |
| `lib/opfs-crypto.ts` | Encrypts/decrypts file content before writing to / after reading from OPFS |
| `lib/opfs-write-queue.ts` | Serialises concurrent OPFS writes into a queue to prevent race conditions on shared file handles |
| `lib/preview-ping.ts` | Polls the WebContainer dev server port until it responds, then signals the preview iframe |
| `lib/projects.ts` | Project-level operations: create, open, rename, delete — coordinates `db.ts` and `opfs.ts` |
| `lib/react-starter-template.ts` | Returns the default in-memory file tree (minimal React + Vite project) for new projects |
| `lib/session.ts` | Manages the browser-side session token via Next.js Route Handlers |
| `lib/useWebContainer.ts` | **Central React hook** — boots the WebContainer singleton, runs `npm install`, starts the dev server |
| `lib/validation.ts` | Zod schemas for validating API route request bodies (signup, login, project creation) |
| `lib/wc-server-headers.ts` | Configures COOP/COEP headers required by SharedArrayBuffer (needed by WebContainers) |
| `lib/wc-sync-manager.ts` | The only authorised path to `webcontainerInstance.fs` — called exclusively on Keep |

### `public/`

| File | Responsibility |
|---|---|
| `public/ai-worker.js` | AI Web Worker entry point; loads WebLLM model, streams token completions back via `postMessage` |

---

## 4. Core Logic Breakdown

### 4.1 AI Model Loading State Machine

State lives in `lib/ai-engine.ts` (React Context, exposed via `useAIContext()`):

```
 "idle"
   │  User clicks "Load Model"
   ▼
 "loading"       ← WebLLM fetches model shards from CDN + compiles WASM
   │              (progress % forwarded via postMessage → loadProgress 0→1)
   ▼
 "ready"         ← Prompt input unlocked; inference can begin
   │  (on error at any stage)
   ▼
 "error"         ← Error message displayed; retry is possible

 "generating"    ← Active during a streaming chat completion
```

Key details:
- The AI Worker is created **exactly once** inside `AIEngineProvider`'s `useEffect`. Hiding/showing `ChatSidebar` only unmounts the UI — the worker keeps running.
- A 2-second **heartbeat** `postMessage` is sent from the worker during generation to prevent any cleanup logic from assuming the worker stopped.
- Token chunks are accumulated into a `streamBufferRef` (no React re-renders per token). A `setInterval` flushes the buffer to `useState` every **100ms** for smooth UI updates.

### 4.2 WebContainer FS Sync (`webcontainerInstance.fs`)

`lib/useWebContainer.ts` owns the container lifecycle:

```
useWebContainer() hook mounts
  │
  ├─► WebContainer.boot()            (one-time, guarded by a module-level ref)
  ├─► mount(starterTemplate)         (writes initial file tree to WC's in-memory FS)
  ├─► run "npm install"              (spawns inside WC, streams install logs to terminal)
  └─► run "npm run dev"              (starts Vite dev server, captures preview URL from stdout)
```

Once running, `lib/wc-sync-manager.ts` is the **only** path that writes files back:

```typescript
webcontainerInstance.fs.writeFile(path, content, { encoding: 'utf-8' })
```

This triggers Vite HMR inside the container, which hot-reloads the preview iframe. OPFS (`lib/opfs.ts` + `lib/opfs-crypto.ts`) is a **parallel durable copy** — it persists encrypted files to `navigator.storage` so the project survives a page refresh. On reload, `useWebContainer` remounts the FS from OPFS rather than the blank starter template.

### 4.3 Keep / Discard — The Safety Gate

The Safety Gate prevents unreviewed AI changes from overwriting files. It lives in `ChatSidebar.tsx`.

```
ai-parser.ts emits FileAction[]
       │
       ▼
ChatSidebar.tsx  handleAccept()
  • Resolves patches via applyPatch()
  • Reads current file for diff context
  • Pushes to pendingChanges[] state
  • Does NOT write anything yet
       │
  ┌────┴─────────┐
  │ Keep         │ Discard
  ▼              ▼
handleKeep()   handleDiscard()
  calls          sets actionStatus
  onApply-       → "rejected"
  FileAction()   clears from
  → writes to    pendingChanges
  WC fs +
  OPFS
```

**Files involved in the Safety Gate:**

| File | Role |
|---|---|
| `lib/ai-parser.ts` | **Producer** — emits `FileAction` objects from streamed LLM tokens |
| `app/components/editor/ChatSidebar.tsx` | **Gate owner** — holds `pendingChanges` state and all Keep/Discard handlers |
| `app/components/editor/DiffView.tsx` | **Gate UI** — renders the per-file diff and Accept/Reject buttons |
| `lib/wc-sync-manager.ts` | **Consumer** — called only on Keep; writes to `webcontainerInstance.fs` |
| `lib/opfs-crypto.ts` | **Persistence** — encrypts and durably stores the accepted change |

> ⚠️ **Important:** `wc-sync-manager.ts` must never be called directly from `ai-engine.ts`. All writes must go through the Safety Gate in `ChatSidebar.tsx`. Bypassing it would allow partial or malformed AI output to silently corrupt the running project.

While `pendingChanges.length > 0`, the chat input is **disabled** — the user must resolve all pending changes before sending a new prompt.

---

## 5. Critical Workflows

### 5.1 "Load Model" Button Click Sequence

```
1.  User clicks "Load Model" in the AI panel
2.  ChatSidebar calls ai.loadModel() from useAIContext()
3.  AIEngineProvider sets status → "loading", posts { type: "init" } to worker
4.  ai-worker.js receives the message, calls mlc.CreateMLCEngine(modelId, { initProgressCallback })
5.  WebLLM fetches model shards from CDN (cached to IndexedDB after first download)
6.  Worker fires postMessage({ type: "init-progress", progress, text }) per shard
7.  AIEngineProvider updates loadProgress (0→1) and loadText; progress bar animates
8.  When all shards are ready, WebLLM compiles them (WASM JIT)
9.  Worker fires postMessage({ type: "init-done", modelId })
10. AIEngineProvider sets status → "ready", modelId stored
11. Prompt textarea and Send button become enabled
```

### 5.2 "Keep" Button Click Sequence

```
1.  User reviews the AI-generated diff in DiffView
2.  User clicks "Accept" → ChatSidebar.handleAccept(msgId, action) is called
3.  handleAccept resolves any PATCH blocks via applyPatch() from ai-parser.ts
4.  handleAccept reads current file content via readFileContent() for diff context
5.  Change is pushed to pendingChanges[] — no file write yet
6.  DiffView shows "Applied: path" label; input is locked
7.  User clicks "Keep" in the pending changes overlay
8.  handleKeep() calls onApplyFileAction(resolvedAction)
9.  Editor page handler calls wc-sync-manager.ts → webcontainerInstance.fs.writeFile()
10. Vite HMR detects the change inside the WebContainer
11. Preview iframe hot-reloads the affected module (no full page reload)
12. Simultaneously, opfs-crypto.ts encrypts and writes the file to OPFS
13. opfs-write-queue.ts serialises the write if multiple files are in-flight
14. PendingChange is removed from the queue; overlay closes
15. If no more pending changes, input is re-enabled
```

---

## 6. Developer Hints

### Top 3 Files to Read First

| Priority | File | Why |
|---|---|---|
| 🥇 1 | `public/ai-worker.js` | **To change AI behaviour** — model selection, inference parameters (`temperature`, `max_tokens`, `stop` sequences), and the streaming loop all live here. Start here if the model cuts off early or if you want to swap models. |
| 🥈 2 | `lib/ai-parser.ts` | **To change how AI output is structured** — defines what a valid `FILE:` rewrite and `PATCH:` search-replace block look like. If you want the AI to produce new output formats, this is the file to modify. The parser contract directly determines what the Safety Gate can display. |
| 🥉 3 | `app/components/editor/ChatSidebar.tsx` | **To change the chat/AI UX** — owns streaming state, the token buffer, `pendingChanges`, and all Keep/Discard handlers. For most AI workflow changes this is your entry point. |

### Additional Tips

- **COOP/COEP headers are mandatory.** WebContainers requires `SharedArrayBuffer`, which needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. If the preview is blank, check `lib/wc-server-headers.ts` and `next.config.ts` first.
- **OPFS is per-origin and per-browser profile.** Data written in Chrome is not visible in Firefox. This is intentional (security boundary) but worth knowing during cross-browser testing.
- **The WebContainer boots exactly once per tab.** There is no "soft reboot" API — a full page reload is required to reset container state during development.
- **Model weights are cached after first download** via the browser Cache API managed by WebLLM. Subsequent "Load Model" clicks for the same model ID are near-instant.
- **The streaming buffer flushes every 100ms.** If you need lower-latency UI updates during generation, reduce the interval in `ChatSidebar.tsx` (`startStreamBuffer`). Reducing it too far (< 16ms) will cause excessive React re-renders.

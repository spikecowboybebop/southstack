/// <reference types="vite/client" />

// ── OPFS type augmentations ────────────────────────────────────────────────
// The File System Access API iterator methods are not fully typed in the
// default DOM lib. We augment FileSystemDirectoryHandle to support
// async iteration (entries/keys/values) which all modern browsers support.

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
}

// ── PWA virtual module declarations ────────────────────────────────────────
// vite-plugin-pwa injects these virtual modules. TypeScript needs to know
// about them so imports don't show red squiggles.

declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function registerSW(
    options?: RegisterSWOptions
  ): (reloadPage?: boolean) => Promise<void>;
}

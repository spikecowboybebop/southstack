/**
 * IndexedDB persistence layer for projects.
 *
 * Separate database from auth — keeps concerns isolated.
 * Each project is scoped to a user via the `owner` field (SHA-256 userHash).
 * Only projects belonging to the current user are returned by queries.
 */

export interface Project {
  id: string;
  /** SHA-256 hash of the owning username — scopes projects to users. */
  owner: string;
  name: string;
  language: string;
  content: string;
  lastModified: string; // ISO-8601
}

const DB_NAME = "southstack-projects";
const DB_VERSION = 2; // bumped for owner index
const STORE_NAME = "projects";

// ─── Database Initialization ────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("lastModified", "lastModified", { unique: false });
      } else {
        // Re-use existing store from the upgrade transaction
        store = request.transaction!.objectStore(STORE_NAME);
      }

      // Add the owner index if it doesn't exist (migration from v1 → v2)
      if (!store.indexNames.contains("owner")) {
        store.createIndex("owner", "owner", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Helpers ────────────────────────────────────────────────

/** Generate a short random ID (URL-safe). */
export function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// ─── CRUD Operations ────────────────────────────────────────

/**
 * Get all projects for a specific user, sorted by lastModified descending.
 */
export async function getAllProjects(owner: string): Promise<Project[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("owner");
    const request = index.getAll(owner);

    request.onsuccess = () => {
      const projects = (request.result as Project[]).sort(
        (a, b) =>
          new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get a single project by ID.
 * Returns null if the project doesn't exist or belongs to a different user.
 */
export async function getProject(id: string, owner?: string): Promise<Project | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const project = (request.result as Project) ?? null;
      // If an owner is specified, enforce ownership check
      if (project && owner && project.owner !== owner) {
        resolve(null);
        return;
      }
      resolve(project);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Create a new project scoped to a user and return it.
 */
export async function createProject(
  name: string,
  language: string = "typescript",
  owner: string
): Promise<Project> {
  const db = await openDB();

  const project: Project = {
    id: generateId(),
    owner,
    name: name.trim(),
    language,
    content: getDefaultContent(name.trim(), language),
    lastModified: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(project);

    request.onsuccess = () => resolve(project);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Update an existing project (partial update + touch lastModified).
 */
export async function updateProject(
  id: string,
  updates: Partial<Pick<Project, "name" | "content" | "language">>
): Promise<Project> {
  const existing = await getProject(id);
  if (!existing) throw new Error(`Project "${id}" not found.`);

  const updated: Project = {
    ...existing,
    ...updates,
    lastModified: new Date().toISOString(),
  };

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(updated);

    request.onsuccess = () => resolve(updated);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a project by ID.
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// ─── Default Content ────────────────────────────────────────

function getDefaultContent(name: string, language: string): string {
  switch (language) {
    case "typescript":
      return `// ${name}\n// Created with SouthStack\n\nexport function main() {\n  console.log("Hello from ${name}!");\n}\n\nmain();\n`;
    case "javascript":
      return `// ${name}\n// Created with SouthStack\n\nfunction main() {\n  console.log("Hello from ${name}!");\n}\n\nmain();\n`;
    case "python":
      return `# ${name}\n# Created with SouthStack\n\ndef main():\n    print("Hello from ${name}!")\n\nif __name__ == "__main__":\n    main()\n`;
    case "html":
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`;
    case "css":
      return `/* ${name} */\n/* Created with SouthStack */\n\n:root {\n  --primary: #6366f1;\n}\n\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n`;
    default:
      return `// ${name}\n// Created with SouthStack\n`;
  }
}

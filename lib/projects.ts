/**
 * IndexedDB persistence layer for projects.
 *
 * Separate database from auth — keeps concerns isolated.
 * Each project: { id, name, language, content, lastModified }
 */

export interface Project {
  id: string;
  name: string;
  language: string;
  content: string;
  lastModified: string; // ISO-8601
}

const DB_NAME = "southstack-projects";
const DB_VERSION = 1;
const STORE_NAME = "projects";

// ─── Database Initialization ────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("lastModified", "lastModified", { unique: false });
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
 * Get all projects, sorted by lastModified descending (newest first).
 */
export async function getAllProjects(): Promise<Project[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

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
 */
export async function getProject(id: string): Promise<Project | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as Project) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Create a new project and return it.
 */
export async function createProject(
  name: string,
  language: string = "typescript"
): Promise<Project> {
  const db = await openDB();

  const project: Project = {
    id: generateId(),
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

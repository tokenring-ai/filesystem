import { beforeEach, describe, expect, it } from "bun:test";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "./FileSystemService.ts";
import { FileSystemConfigSchema } from "./schema.ts";

function createMockFileSystemProvider(initialFiles: Record<string, string>) {
  const files = new Map(Object.entries(initialFiles).map(([filePath, content]) => [filePath, Buffer.from(content)]));

  const listDirectories = () => {
    const directories = new Set<string>();
    for (const filePath of files.keys()) {
      let currentPath = path.posix.dirname(filePath);
      while (currentPath && currentPath !== "." && currentPath !== "/" && currentPath !== "/repo") {
        directories.add(currentPath);
        currentPath = path.posix.dirname(currentPath);
      }
    }
    return directories;
  };

  return {
    async *getDirectoryTree(
      absolutePath: string,
      { ignoreFilter, recursive = true }: { ignoreFilter: (path: string, isDirectory?: boolean) => boolean | Promise<boolean>; recursive?: boolean },
    ) {
      const entries = new Set<string>();
      const normalizedRoot = absolutePath === "/" ? "/" : absolutePath.replace(/\/+$/, "");

      for (const directoryPath of listDirectories()) {
        const relativePath = path.posix.relative(normalizedRoot, directoryPath);
        if (!relativePath || relativePath.startsWith("..") || path.posix.isAbsolute(relativePath)) continue;

        if (!recursive && relativePath.includes("/")) continue;
        entries.add(`${directoryPath}/`);
      }

      for (const filePath of files.keys()) {
        const relativePath = path.posix.relative(normalizedRoot, filePath);
        if (!relativePath || relativePath.startsWith("..") || path.posix.isAbsolute(relativePath)) continue;

        if (!recursive && relativePath.includes("/")) continue;
        entries.add(filePath);
      }

      for (const entry of [...entries].sort()) {
        if (!(await ignoreFilter(entry, entry.endsWith("/")))) {
          yield entry;
        }
      }
    },
    async writeFile(absolutePath: string, content: string | Buffer) {
      files.set(absolutePath, (Buffer.isBuffer(content) ? content : Buffer.from(content)) as Buffer<ArrayBuffer>);
      return true;
    },
    async appendFile(absolutePath: string, content: string | Buffer) {
      const current = files.get(absolutePath) ?? Buffer.alloc(0);
      const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
      files.set(absolutePath, Buffer.concat([current, next]));
      return true;
    },
    async deleteFile(absolutePath: string) {
      return files.delete(absolutePath);
    },
    async readFile(absolutePath: string) {
      return files.get(absolutePath) ?? null;
    },
    async rename(oldAbsolutePath: string, newAbsolutePath: string) {
      const current = files.get(oldAbsolutePath);
      if (!current) return false;
      files.set(newAbsolutePath, current);
      files.delete(oldAbsolutePath);
      return true;
    },
    async exists(absolutePath: string) {
      return files.has(absolutePath) || listDirectories().has(absolutePath);
    },
    async stat(absolutePath: string) {
      const current = files.get(absolutePath);
      if (current) {
        return {
          path: absolutePath,
          absolutePath,
          exists: true as const,
          isFile: true,
          isDirectory: false,
          size: current.length,
          modified: new Date("2026-01-01T00:00:00.000Z"),
        };
      }

      if (listDirectories().has(absolutePath)) {
        return {
          path: absolutePath,
          absolutePath,
          exists: true as const,
          isFile: false,
          isDirectory: true,
          size: 0,
          modified: new Date("2026-01-01T00:00:00.000Z"),
        };
      }

      return {
        path: absolutePath,
        exists: false as const,
      };
    },
    async createDirectory() {
      return true;
    },
    async copy() {
      return true;
    },
    async watch() {
      return null;
    },
    async grep() {
      return [];
    },
  };
}

describe("FileSystemService allow-list glob", () => {
  const app = createTestingApp();
  const provider = createMockFileSystemProvider({
    "/repo/src/example.ts": "export const example = true;\n",
    "/repo/src/index.js": "console.log('index');\n",
    "/repo/src/components/Button.tsx": "export function Button() {}\n",
    "/repo/assets/logo.png": "png",
    "/notes/todo.md": "todo\n",
  });
  const fileSystemService = new FileSystemService(
    app,
    FileSystemConfigSchema.parse({
      agentDefaults: {
        provider: "mock",
        selectedFiles: [],
      },
      allowedPaths: [
        { path: "/repo", permission: "write" },
        { path: "/notes", permission: "read" },
      ],
    }),
  );

  fileSystemService.registerFileSystemProvider("mock", provider as any);
  app.addService(FileSystemService, fileSystemService);
  fileSystemService.start();

  let agent: ReturnType<typeof createTestingAgent>;

  beforeEach(() => {
    agent = createTestingAgent(app);
    fileSystemService.attach(agent, { items: [] } as any);
  });

  it("matches relative patterns against the ephemeral cwd and returns absolute paths", async () => {
    expect(fileSystemService.glob("src/*.{ts,js}", { cwd: "/repo" }, agent)).resolves.toEqual(["/repo/src/example.ts", "/repo/src/index.js"]);
  });

  it("rejects relative patterns without a cwd", async () => {
    expect(fileSystemService.glob("src/*.ts", {}, agent)).rejects.toThrow(/cwd/);
  });

  it("supports absolute patterns directly", async () => {
    expect(fileSystemService.glob("/repo/src/*.{ts,js}", {}, agent)).resolves.toEqual(["/repo/src/example.ts", "/repo/src/index.js"]);
  });

  it("matches directories when includeDirectories is enabled", async () => {
    expect(fileSystemService.glob("src/*", { cwd: "/repo", includeDirectories: true }, agent)).resolves.toEqual([
      "/repo/src/components",
      "/repo/src/example.ts",
      "/repo/src/index.js",
    ]);
  });

  it("supports exact directory matches", async () => {
    expect(fileSystemService.glob("src/components", { cwd: "/repo", includeDirectories: true }, agent)).resolves.toEqual(["/repo/src/components"]);
  });

  it("rejects patterns outside the allow-list", async () => {
    expect(fileSystemService.glob("/etc/*", {}, agent)).rejects.toThrow(/allowed/);
  });

  it("permits reads but rejects writes inside a read-only root", async () => {
    expect(await fileSystemService.readTextFile("/notes/todo.md", agent)).toBe("todo\n");
    expect(fileSystemService.writeFile("/notes/todo.md", "nope", agent)).rejects.toThrow(/read-only/);
  });

  it("rejects writes outside every allowed root", async () => {
    expect(fileSystemService.writeFile("/etc/passwd", "nope", agent)).rejects.toThrow(/allowed/);
  });
});

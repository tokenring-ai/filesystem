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

describe("FileSystemService directory delete, content search and versions (agentless)", () => {
  const app = createTestingApp();
  const provider = createMockFileSystemProvider({
    "/repo/src/example.ts": "export const example = true;\n",
    "/repo/src/nested/deep.ts": "deep\n",
    "/repo/build/out.js": "out\n",
    "/notes/todo.md": "todo\n",
  });
  const deleted: string[] = [];
  const grepCalls: { search: unknown; options: Record<string, unknown> }[] = [];
  const extended = {
    ...provider,
    async deleteDirectory(absolutePath: string) {
      deleted.push(absolutePath);
      return true;
    },
    async grep(search: unknown, options: Record<string, unknown>) {
      grepCalls.push({ search, options });
      return [1, 2, 3, 4].map(line => ({ file: "/repo/src/example.ts", line, match: `match ${line}`, content: null }));
    },
  };
  const fileSystemService = new FileSystemService(
    app,
    FileSystemConfigSchema.parse({
      agentDefaults: { provider: "mock", selectedFiles: [] },
      allowedPaths: [
        { path: "/repo", permission: "write" },
        { path: "/notes", permission: "read" },
      ],
    }),
  );
  fileSystemService.registerFileSystemProvider("mock", extended as any);
  fileSystemService.start();

  beforeEach(() => {
    deleted.length = 0;
    grepCalls.length = 0;
  });

  it("deletes a directory inside a writable root", async () => {
    expect(await fileSystemService.deleteDirectoryForProvider("/repo/build", "mock")).toBe(true);
    expect(deleted).toEqual(["/repo/build"]);
  });

  it("refuses allowed roots, their ancestors, the workspace, read-only roots and paths outside the allow-list", async () => {
    await expect(fileSystemService.deleteDirectoryForProvider("/repo", "mock")).rejects.toThrow(/allowed root/);
    await expect(fileSystemService.deleteDirectoryForProvider("/", "mock")).rejects.toThrow();
    await expect(fileSystemService.deleteDirectoryForProvider("/tmp", "mock")).rejects.toThrow(/allowed root/);
    await expect(fileSystemService.deleteDirectoryForProvider("/notes", "mock")).rejects.toThrow(/read-only|allowed root/);
    await expect(fileSystemService.deleteDirectoryForProvider("/etc", "mock")).rejects.toThrow(/allowed/);
    expect(deleted).toEqual([]);
  });

  it("refuses files and missing directories", async () => {
    await expect(fileSystemService.deleteDirectoryForProvider("/repo/src/example.ts", "mock")).rejects.toThrow(/not a directory/);
    await expect(fileSystemService.deleteDirectoryForProvider("/repo/missing", "mock")).rejects.toThrow(/does not exist/);
    expect(deleted).toEqual([]);
  });

  it("counts what a recursive delete would remove", async () => {
    expect(await fileSystemService.countDirectoryEntriesForProvider("/repo/src", "mock")).toEqual({ files: 2, directories: 1, truncated: false });
    expect(await fileSystemService.countDirectoryEntriesForProvider("/repo/src", "mock", 2)).toEqual({ files: 1, directories: 1, truncated: true });
  });

  it("searches contents under an allowed directory with a result limit", async () => {
    const result = await fileSystemService.grepForProvider("match", { cwd: "/repo", maxResults: 3, ignoreCase: true }, "mock");
    expect(result.matches.map(match => match.line)).toEqual([1, 2, 3]);
    expect(result.truncated).toBe(true);
    expect(grepCalls[0]?.options).toMatchObject({ cwd: "/repo", maxResults: 4, ignoreCase: true });
    await expect(fileSystemService.grepForProvider("x", { cwd: "/etc", maxResults: 3 }, "mock")).rejects.toThrow(/allowed/);
  });

  it("returns no versions when archiving is disabled or does not cover the file", async () => {
    expect(await fileSystemService.listVersions("/repo/src/example.ts")).toEqual([]);
  });
});

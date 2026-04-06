import {beforeEach, describe, expect, it} from "vitest";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import FileSystemService from "./FileSystemService.ts";
import {FileSystemConfigSchema} from "./schema.ts";

function createMockFileSystemProvider(initialFiles: Record<string, string>) {
  const files = new Map(
    Object.entries(initialFiles).map(([filePath, content]) => [filePath, Buffer.from(content)]),
  );

  const listDirectories = () => {
    const directories = new Set<string>();
    for (const filePath of files.keys()) {
      let currentPath = path.posix.dirname(filePath);
      while (currentPath && currentPath !== "." && currentPath !== "/repo") {
        directories.add(currentPath);
        currentPath = path.posix.dirname(currentPath);
      }
    }
    return directories;
  };

  return {
    async *getDirectoryTree(absolutePath: string, {ignoreFilter, recursive = true}: {ignoreFilter: (path: string) => boolean; recursive?: boolean}) {
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
        if (!ignoreFilter(entry)) {
          yield entry;
        }
      }
    },
    async writeFile(absolutePath: string, content: string | Buffer) {
      files.set(absolutePath, Buffer.isBuffer(content) ? content : Buffer.from(content));
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

describe("FileSystemService glob fallback", () => {
  const app = createTestingApp();
  const provider = createMockFileSystemProvider({
    "/repo/src/example.ts": "export const example = true;\n",
    "/repo/src/index.js": "console.log('index');\n",
    "/repo/src/components/Button.tsx": "export function Button() {}\n",
    "/repo/assets/logo.png": "png",
  });
  const fileSystemService = new FileSystemService(FileSystemConfigSchema.parse({
    agentDefaults: {
      provider: "mock",
      workingDirectory: "/repo",
      selectedFiles: [],
      fileWrite: {
        requireReadBeforeWrite: true,
        maxReturnedDiffSize: 10_000,
        validateWrittenFiles: false,
      },
      fileRead: {
        maxFileReadCount: 10,
        maxFileSize: 128 * 1024,
      },
      fileSearch: {
        maxSnippetCount: 10,
        maxSnippetSizePercent: 0.3,
        snippetLinesBefore: 5,
        snippetLinesAfter: 5,
      },
    },
  }));

  fileSystemService.registerFileSystemProvider("mock", provider as any);
  app.addServices(fileSystemService);
  fileSystemService.start();

  let agent: ReturnType<typeof createTestingAgent>;

  beforeEach(() => {
    agent = createTestingAgent(app);
    fileSystemService.attach(agent, {items: []} as any);
  });

  it("matches files when the provider does not implement glob", async () => {
    await expect(fileSystemService.glob("src/*.{ts,js}", {}, agent))
      .resolves.toEqual(["src/example.ts", "src/index.js"]);
  });

  it("matches directories when includeDirectories is enabled", async () => {
    await expect(fileSystemService.glob("src/*", {includeDirectories: true}, agent))
      .resolves.toEqual(["src/components", "src/example.ts", "src/index.js"]);
  });

  it("supports exact directory matches without provider glob support", async () => {
    await expect(fileSystemService.glob("src/components", {includeDirectories: true}, agent))
      .resolves.toEqual(["src/components"]);
  });
});

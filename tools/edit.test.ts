import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {FileSystemConfigSchema} from "../schema.ts";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import findReplaceTool from "./edit.ts";

function createMockFileSystemProvider(initialFiles: Record<string, string>) {
  const files = new Map(
    Object.entries(initialFiles).map(([filePath, content]) => [filePath, Buffer.from(content)]),
  );

  return {
    files,
    async *getDirectoryTree() {
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
      return files.has(absolutePath);
    },
    async stat(absolutePath: string) {
      const current = files.get(absolutePath);
      if (!current) {
        return {
          path: absolutePath,
          exists: false as const,
        };
      }

      return {
        path: absolutePath,
        absolutePath,
        exists: true as const,
        isFile: true,
        isDirectory: false,
        size: current.length,
        modified: new Date("2026-01-01T00:00:00.000Z"),
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

describe("file_findReplace", () => {
  let app: ReturnType<typeof createTestingApp>;
  let agent: ReturnType<typeof createTestingAgent>;
  let fileSystemService: FileSystemService;
  let provider: ReturnType<typeof createMockFileSystemProvider>;

  beforeEach(() => {
    app = createTestingApp();
    provider = createMockFileSystemProvider({
      "/repo/src/example.ts": [
        "function example() {",
        '  const message = "The quick brown fox jumps over the lazy dog";',
        "}",
        "",
      ].join("\n"),
    });

    fileSystemService = new FileSystemService(FileSystemConfigSchema.parse({
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

    agent = createTestingAgent(app);
    fileSystemService.attach(agent, {items: []} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    app.shutdown();
  });

  it("replaces a word-based match while ignoring whitespace differences", async () => {
    agent.mutateState(FileSystemState, (state) => {
      state.readFiles.set("src/example.ts", 12345);
    });

    const result = await findReplaceTool.execute({
      path: "src/example.ts",
      find: 'lazy   dog";',
      replace: 'lazy cat";',
      multiple: false,
    }, agent);

    expect(provider.files.get("/repo/src/example.ts")?.toString("utf-8")).toContain("lazy cat");
    expect(agent.getState(FileSystemState).readFiles.get("src/example.ts")).toBe(12345);
    expect(fileSystemService.isDirty(agent)).toBe(true);
    expect(typeof result).not.toBe("string");
    expect((result as any).result).toContain("Success");
  });

  it("returns the match list when multiple matches are found and multiple=false", async () => {
    provider.files.set("/repo/src/example.ts", Buffer.from([
      "alpha beta",
      "something",
      "alpha beta",
      "",
    ].join("\n")));

    const result = await findReplaceTool.execute({
      path: "src/example.ts",
      find: "alpha beta",
      replace: "gamma",
      multiple: false,
    }, agent);

    expect(typeof result).toBe("string");
    expect(result as string).toContain("Found 2 matches");
    expect(provider.files.get("/repo/src/example.ts")?.toString("utf-8")).toContain("alpha beta");
  });

  it("replaces every match when multiple=true", async () => {
    provider.files.set("/repo/src/example.ts", Buffer.from([
      "alpha beta",
      "something",
      "alpha\tbeta",
      "",
    ].join("\n")));

    await findReplaceTool.execute({
      path: "src/example.ts",
      find: "alpha beta",
      replace: "gamma",
      multiple: true,
    }, agent);

    const content = provider.files.get("/repo/src/example.ts")!.toString("utf-8");
    expect(content).not.toContain("alpha");
    expect(content.match(/gamma/g)?.length).toBe(2);
  });
});

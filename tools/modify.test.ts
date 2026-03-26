import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {FileSystemConfigSchema} from "../schema.ts";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import findReplaceTool from "./modify.ts";

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
    async glob() {
      return [];
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
      providers: {},
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

  it("updates the file through a fuzzy whole-line match without changing the tracked read timestamp", async () => {
    agent.mutateState(FileSystemState, (state) => {
      state.readFiles.set("src/example.ts", 12345);
    });
    const infoSpy = vi.spyOn(agent, "infoMessage");

    const result = await findReplaceTool.execute({
      path: "src/example.ts",
      findLines: [
        'const message = "The quick brown fox jumps over the lazy dox";',
      ],
      replaceLines: [
        '  const message = "The quick brown fox jumps over the lazy cat";',
      ],
    }, agent);

    expect(provider.files.get("/repo/src/example.ts")?.toString("utf-8")).toContain("lazy cat");
    expect(agent.getState(FileSystemState).readFiles.get("src/example.ts")).toBe(12345);
    expect(fileSystemService.isDirty(agent)).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("Applying fuzzy match"));
    expect(result.type).toBe("text");
    expect((result as any).text).toContain("File successfully written. Changes made:");
    expect((result as any).artifact.mimeType).toBe("text/x-diff");
    expect((result as any).artifact.body).toContain('+  const message = "The quick brown fox jumps over the lazy cat";');
  });

  it("throws when the requested block matches multiple locations exactly", async () => {
    provider.files.set("/repo/src/example.ts", Buffer.from([
      "alpha",
      "beta",
      "alpha",
      "beta",
      "",
    ].join("\n")));

    await expect(findReplaceTool.execute({
      path: "src/example.ts",
      findLines: "alpha\nbeta",
      replaceLines: "gamma",
    }, agent)).rejects.toThrow("Expected exactly one match");
  });
});

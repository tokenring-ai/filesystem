import { beforeEach, describe, expect, it } from "bun:test";
import type { InputMessage } from "@tokenring-ai/agent/AgentEvents";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemConfigSchema } from "../schema.ts";
import { invalidateWorkspaceFileIndex } from "../util/workspaceFileIndex.ts";
import FilesystemContextualSearchProvider from "./FilesystemContextualSearchProvider.ts";

function createMockFileSystemProvider(initialFiles: Record<string, string>) {
  const files = new Map(Object.entries(initialFiles).map(([filePath, content]) => [filePath, Buffer.from(content)]));
  return {
    async *getDirectoryTree(absolutePath: string, { ignoreFilter }: { ignoreFilter: (path: string) => boolean }) {
      const prefix = absolutePath.endsWith("/") ? absolutePath : `${absolutePath}/`;
      for (const filePath of files.keys()) {
        if ((filePath === absolutePath || filePath.startsWith(prefix)) && !ignoreFilter(filePath)) {
          yield filePath;
        }
      }
    },
    async writeFile() {
      return true;
    },
    async appendFile() {
      return true;
    },
    async deleteFile() {
      return true;
    },
    async readFile(absolutePath: string) {
      return files.get(absolutePath) ?? null;
    },
    async rename() {
      return true;
    },
    async exists(absolutePath: string) {
      return files.has(absolutePath);
    },
    async stat(absolutePath: string) {
      const current = files.get(absolutePath);
      if (!current) return { path: absolutePath, exists: false as const };
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
      return [...files.keys()];
    },
  };
}

describe("FilesystemContextualSearchProvider", () => {
  const app = createTestingApp();
  const fileSystemService = new FileSystemService(
    FileSystemConfigSchema.parse({
      agentDefaults: {
        provider: "mock",
        workingDirectory: "/repo",
      },
    }),
  );
  fileSystemService.registerFileSystemProvider(
    "mock",
    createMockFileSystemProvider({
      "/repo/src/example.ts": "export const example = true;\n",
      "/repo/src/index.js": "console.log('index');\n",
      "/repo/README.md": "# hi\n",
    }) as never,
  );
  app.addService(FileSystemService, fileSystemService);
  fileSystemService.start();

  const provider = new FilesystemContextualSearchProvider(app);
  let agent: ReturnType<typeof createTestingAgent>;

  beforeEach(() => {
    invalidateWorkspaceFileIndex("mock");
    agent = createTestingAgent(app);
    fileSystemService.attach(agent, { items: [] });
  });

  it("returns tagged file matches with the filesystem provider in the id", async () => {
    const results: Array<{ title?: string; tag?: string; id?: string }> = [];
    for await (const batch of provider.search({ query: "example", limit: 8, agent })) {
      results.push(...batch);
    }
    expect(results.length).toBe(1);
    expect(results[0]?.title).toBe("example.ts");
    expect(results[0]?.tag).toBe("@[file:mock:/repo/src/example.ts]");
    expect(results[0]?.id).toBe("mock:/repo/src/example.ts");
  });

  it("attaches the file when resolving a tag on the active filesystem", async () => {
    const input: InputMessage = { from: "user", message: "@[file:mock:/repo/src/example.ts]" };
    await provider.resolve({ itemId: "mock:/repo/src/example.ts" }, input, agent);
    expect(input.attachments).toEqual([
      expect.objectContaining({
        name: "/repo/src/example.ts",
        body: "export const example = true;\n",
      }),
    ]);
  });
});

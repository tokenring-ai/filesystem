import { beforeEach, describe, expect, it } from "bun:test";
import type { InputMessage } from "@tokenring-ai/agent/AgentEvents";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemConfigSchema } from "../schema.ts";
import { invalidateWorkspaceFileIndex } from "../util/workspaceFileIndex.ts";
import FilesystemContextualSearchProvider from "./FilesystemContextualSearchProvider.ts";

function createMockHostFileSystem(initialFiles: Record<string, string>) {
  const files = new Map(Object.entries(initialFiles).map(([filePath, content]) => [filePath, Buffer.from(content)]));
  return {
    async *getDirectoryTree(absolutePath: string, { ignoreFilter }: { ignoreFilter: (path: string) => boolean | Promise<boolean> }) {
      const prefix = absolutePath.endsWith("/") ? absolutePath : `${absolutePath}/`;
      for (const filePath of files.keys()) {
        if ((filePath === absolutePath || filePath.startsWith(prefix)) && !(await ignoreFilter(filePath))) {
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
    app,
    FileSystemConfigSchema.parse({
      allowedPaths: [{ path: "/repo", permission: "write" }],
    }),
    createMockHostFileSystem({
      "/repo/src/example.ts": "export const example = true;\n",
      "/repo/src/index.js": "console.log('index');\n",
      "/repo/README.md": "# hi\n",
    }) as never,
  );
  app.addService(FileSystemService, fileSystemService);

  const provider = new FilesystemContextualSearchProvider(app);
  let agent: ReturnType<typeof createTestingAgent>;

  beforeEach(() => {
    invalidateWorkspaceFileIndex();
    agent = createTestingAgent(app);
    fileSystemService.attach(agent, { items: [] });
  });

  it("returns tagged file matches keyed by absolute path", async () => {
    const results = await provider.search({ query: "example", limit: 8, agent });
    expect(results.length).toBe(1);
    expect(results[0]?.title).toBe("example.ts");
    expect(results[0]?.tag).toBe("@[file:/repo/src/example.ts]");
    expect(results[0]?.id).toBe("/repo/src/example.ts");
  });

  it("attaches the file when resolving an item id", async () => {
    const input: InputMessage = { from: "user", message: "@[file:/repo/src/example.ts]" };
    await provider.resolve({ itemId: "/repo/src/example.ts" }, input, agent);
    expect(input.attachments).toEqual([
      expect.objectContaining({
        name: "/repo/src/example.ts",
        body: "export const example = true;\n",
      }),
    ]);
  });

  it("still resolves legacy provider-prefixed ids", async () => {
    const input: InputMessage = { from: "user", message: "@[file:mock:/repo/src/index.js]" };
    await provider.resolve({ itemId: "mock:/repo/src/index.js" }, input, agent);
    expect(input.attachments).toEqual([expect.objectContaining({ name: "/repo/src/index.js" })]);
  });
});

import { beforeEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import path from "node:path";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import QueueService from "@tokenring-ai/queue/QueueService";
import type { FileSystemProvider, FileSystemWatcher } from "./FileSystemProvider.ts";
import FileSystemService from "./FileSystemService.ts";
import FileWatchService from "./FileWatchService.ts";
import { FileSystemConfigSchema } from "./schema.ts";

class MockWatcher extends EventEmitter implements FileSystemWatcher {
  closed = false;
  close(): void {
    this.closed = true;
    this.removeAllListeners();
  }
}

function createMockProvider(files: Map<string, string>) {
  let lastWatcher: MockWatcher | null = null;
  let lastWatchOptions: { ignoreFilter?: (p: string) => boolean; stabilityThreshold?: number } | null = null;

  const provider = {
    async *getDirectoryTree() {},
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
      const content = files.get(absolutePath);
      return content != null ? Buffer.from(content) : null;
    },
    async rename() {
      return true;
    },
    async exists(absolutePath: string) {
      return files.has(absolutePath);
    },
    async stat(absolutePath: string) {
      if (!files.has(absolutePath)) return { path: absolutePath, exists: false as const };
      return {
        path: absolutePath,
        absolutePath,
        exists: true as const,
        isFile: true,
        isDirectory: false,
        size: files.get(absolutePath)!.length,
      };
    },
    async createDirectory() {
      return true;
    },
    async copy() {
      return true;
    },
    async watch(_dir: string, options?: { ignoreFilter?: (p: string) => boolean; stabilityThreshold?: number }) {
      lastWatchOptions = options ?? null;
      lastWatcher = new MockWatcher();
      return lastWatcher;
    },
  };

  return {
    provider: provider as unknown as FileSystemProvider,
    getLastWatcher: () => lastWatcher,
    getLastWatchOptions: () => lastWatchOptions,
  };
}

describe("FileWatchService", () => {
  const workingDirectory = "/repo";
  const filePath = path.join(workingDirectory, "notes", "todo.md");
  const files = new Map<string, string>([[filePath, "hello world\n"]]);

  let app: ReturnType<typeof createTestingApp>;
  let fileSystemService: FileSystemService;
  let fileWatchService: FileWatchService;
  let queueService: QueueService;
  let mockFs: ReturnType<typeof createMockProvider>;

  beforeEach(async () => {
    app = createTestingApp();
    mockFs = createMockProvider(files);
    fileSystemService = new FileSystemService();
    fileSystemService.registerFileSystemProvider("mock", mockFs.provider);
    fileWatchService = new FileWatchService(app);
    queueService = new QueueService(app, {
      defaultAgentType: "test",
      defaultConcurrency: 1,
      maxResults: 50,
      pollIntervalMs: 60_000,
      queues: { default: { agentType: "test" }, ingest: { agentType: "test" } },
    });

    app.addService(FileSystemService, fileSystemService);
    app.addService(FileWatchService, fileWatchService);
    app.addService(QueueService, queueService);

    const config = FileSystemConfigSchema.parse({
      agentDefaults: {
        provider: "mock",
        workingDirectory,
      },
      watch: {
        notes: {
          path: "notes",
          include: "\\.md$",
          stabilityThreshold: 10,
          actions: [{ action: "addToQueue", queue: "ingest" }],
        },
      },
    });

    fileSystemService.reconfigure(config);
    await fileWatchService.reconfigure(config);
  });

  it("opens a watcher for each configured watch entry", () => {
    expect(mockFs.getLastWatcher()).not.toBeNull();
    expect(mockFs.getLastWatchOptions()?.stabilityThreshold).toBe(10);
  });

  it("enqueues file path and contents after a stable change", async () => {
    const watcher = mockFs.getLastWatcher()!;
    // Bypass bootstrap skip window used to ignore the initial directory scan.
    (fileWatchService as unknown as { activeWatches: Map<string, { readyAt: number }> }).activeWatches.get("notes")!.readyAt = 0;

    files.set(filePath, "updated content\n");
    watcher.emit("change", filePath);

    // Allow the async handler to complete.
    await new Promise(resolve => setTimeout(resolve, 20));

    const pending = queueService.getPending("ingest");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.name).toBe("notes/todo.md");
    expect(pending[0]!.input.from).toBe("Filesystem Watch (notes)");
    expect(pending[0]!.input.message).toBe("File changed: notes/todo.md");
    expect(pending[0]!.input.attachments).toEqual([
      {
        name: "notes/todo.md",
        description: 'Changed file from watch "notes"',
        encoding: "text",
        mimeType: "text/markdown",
        body: "updated content\n",
      },
    ]);
  });

  it("skips files that do not match contentIncludes", async () => {
    const config = FileSystemConfigSchema.parse({
      agentDefaults: {
        provider: "mock",
        workingDirectory,
      },
      watch: {
        notes: {
          path: "notes",
          include: "\\.md$",
          contentIncludes: "URGENT",
          stabilityThreshold: 10,
          actions: [{ action: "addToQueue", queue: "ingest" }],
        },
      },
    });

    await fileWatchService.reconfigure(config);
    const watcher = mockFs.getLastWatcher()!;
    (fileWatchService as unknown as { activeWatches: Map<string, { readyAt: number }> }).activeWatches.get("notes")!.readyAt = 0;

    files.set(filePath, "nothing urgent here\n");
    watcher.emit("change", filePath);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(queueService.getPending("ingest")).toHaveLength(0);

    files.set(filePath, "this is URGENT\n");
    watcher.emit("change", filePath);
    await new Promise(resolve => setTimeout(resolve, 20));

    const pending = queueService.getPending("ingest");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.input.attachments?.[0]?.body).toContain("this is URGENT");
  });

  it("ignores events during the bootstrap window", async () => {
    const watcher = mockFs.getLastWatcher()!;
    // readyAt is still in the future from start()
    watcher.emit("change", filePath);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(queueService.getPending("ingest")).toHaveLength(0);
  });

  it("closes watchers on stop", async () => {
    const watcher = mockFs.getLastWatcher()!;
    fileWatchService.stop();
    expect(watcher.closed).toBe(true);
  });
});

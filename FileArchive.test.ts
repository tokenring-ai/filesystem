import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import TokenRingApp from "@tokenring-ai/app";
import ChatService from "@tokenring-ai/chat/ChatService";
import FileSystemService from "./FileSystemService.ts";
import { FileSystemConfigSchema } from "./schema.ts";
import deleteTool from "./tools/delete.ts";

function createMockProvider(initialFiles: Record<string, string> = {}) {
  const files = new Map<string, Buffer>(Object.entries(initialFiles).map(([filePath, content]) => [filePath, Buffer.from(content)]));

  return {
    files,
    async *getDirectoryTree() {},
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
    async exists(absolutePath: string) {
      return files.has(absolutePath);
    },
    async stat(absolutePath: string) {
      const current = files.get(absolutePath);
      if (!current) return { path: absolutePath, exists: false as const };
      return { path: absolutePath, exists: true as const, isFile: true, size: current.length };
    },
    async createDirectory() {
      return true;
    },
  };
}

describe("filesystem archiving", () => {
  const tempDirs: string[] = [];
  let workspace: string;
  let app: TokenRingApp;
  let service: FileSystemService;
  let provider: ReturnType<typeof createMockProvider>;

  function makeService(archiveOverrides: Record<string, unknown> = {}): void {
    service = new FileSystemService(
      app,
      FileSystemConfigSchema.parse({
        agentDefaults: { provider: "mock", selectedFiles: [] },
        archive: archiveOverrides,
      }),
    );
    service.registerFileSystemProvider("mock", provider as never);
    app.addService(FileSystemService, service);
    service.start();
  }

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "tr-file-archive-"));
    tempDirs.push(workspace);
    app = new TokenRingApp({
      app: {
        workingDirectory: workspace,
        workspaceDirectory: workspace,
        configDirectories: [],
        shutdownMonitorIntervalMs: 2000,
        serviceRestartDelayMs: 5000,
        printLogs: false,
      },
    });
    provider = createMockProvider();
  });

  afterEach(() => {
    app.shutdown();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("writeSystemFile archives the previous version before overwriting", async () => {
    makeService();
    const target = path.join(workspace, "web-design", "landing", "index.html");
    await service.writeSystemFile(target, "<h1>v1</h1>");
    await service.writeSystemFile(target, "<h1>v2</h1>");
    await service.writeSystemFile(target, "<h1>v3</h1>");

    const versions = await service.listVersions(target);
    // Creation archives nothing; the two overwrites archive what they replaced.
    expect(versions).toHaveLength(2);

    const first = await service.readVersion(target, versions[1]!.id);
    expect(first?.toString("utf8")).toBe("<h1>v1</h1>");
    const second = await service.readVersion(target, versions[0]!.id);
    expect(second?.toString("utf8")).toBe("<h1>v2</h1>");

    // The live file holds the newest content.
    expect(provider.files.get(target)?.toString("utf8")).toBe("<h1>v3</h1>");
  });

  test("rewriting identical content does not create a new version", async () => {
    makeService();
    const target = path.join(workspace, "notes", "todo.txt");
    await service.writeSystemFile(target, "same");
    await service.writeSystemFile(target, "same");
    await service.writeSystemFile(target, "same");
    await service.writeSystemFile(target, "changed");

    const versions = await service.listVersions(target);
    expect(versions).toHaveLength(1);
    expect((await service.readVersion(target, versions[0]!.id))?.toString("utf8")).toBe("same");
  });

  test("prunes versions beyond maxVersions", async () => {
    makeService({ maxVersions: 2 });
    const target = path.join(workspace, "file.txt");
    for (const content of ["a", "b", "c", "d"]) {
      await service.writeSystemFile(target, content);
    }

    const versions = await service.listVersions(target);
    expect(versions).toHaveLength(2);
    expect((await service.readVersion(target, versions[0]!.id))?.toString("utf8")).toBe("c");
    expect((await service.readVersion(target, versions[1]!.id))?.toString("utf8")).toBe("b");
  });

  test("disabled archiving stores nothing", async () => {
    makeService({ enabled: false });
    const target = path.join(workspace, "file.txt");
    await service.writeSystemFile(target, "v1");
    await service.writeSystemFile(target, "v2");

    expect(await service.listVersions(target)).toEqual([]);
    expect(await service.readVersion(target, "v1")).toBeNull();
  });

  test("built-in and configured excludes are never archived", async () => {
    makeService({ exclude: ["^secrets/"] });
    for (const relative of [".git/config", "node_modules/pkg/index.js", ".archive/x/f.txt", "secrets/key.txt"]) {
      const target = path.join(workspace, relative);
      await service.writeSystemFile(target, "v1");
      await service.writeSystemFile(target, "v2");
      expect(await service.listVersions(target)).toEqual([]);
    }

    // A regular sibling file still archives.
    const target = path.join(workspace, "src/app.ts");
    await service.writeSystemFile(target, "v1");
    await service.writeSystemFile(target, "v2");
    expect(await service.listVersions(target)).toHaveLength(1);
  });

  test("agent writeFile and appendFile archive and notify listeners", async () => {
    makeService();
    const agent = createTestingAgent(app);
    service.attach(agent, { items: [] } as never);
    const target = path.join(workspace, "story.md");

    const writes: string[] = [];
    const unsubscribe = service.onFileWritten(absolutePath => writes.push(absolutePath));

    await service.writeFile(target, "chapter 1", agent);
    await service.appendFile(target, "\nchapter 2", agent);
    await service.writeFile(target, "chapter 1\nchapter 2\nchapter 3", agent);
    unsubscribe();
    await service.writeFile(target, "chapter 4", agent);

    const versions = await service.listVersions(target);
    // write("chapter 1") creates; append archives ch1; third write archives ch1+ch2;
    // the fourth write still archives (only the listener was unsubscribed).
    expect(versions).toHaveLength(3);
    expect((await service.readVersion(target, versions[2]!.id))?.toString("utf8")).toBe("chapter 1");
    expect((await service.readVersion(target, versions[1]!.id))?.toString("utf8")).toBe("chapter 1\nchapter 2");
    expect((await service.readVersion(target, versions[0]!.id))?.toString("utf8")).toBe("chapter 1\nchapter 2\nchapter 3");
    expect(writes).toHaveLength(3);
    expect(writes.every(filePath => filePath === target)).toBe(true);
  });

  test("readVersion returns null for unknown versions and out-of-workspace paths never archive", async () => {
    makeService();
    const target = path.join(workspace, "file.txt");
    await service.writeSystemFile(target, "v1");
    await service.writeSystemFile(target, "v2");
    expect(await service.readVersion(target, "v-nope")).toBeNull();

    const outside = path.join(tempDirs[0] ? path.dirname(workspace) : "/tmp", `outside-${Date.now()}.txt`);
    await service.writeSystemFile(outside, "v1");
    await service.writeSystemFile(outside, "v2");
    expect(await service.listVersions(outside)).toEqual([]);
  });
});

describe("file_delete", () => {
  const tempDirs: string[] = [];
  let workspace: string;
  let app: TokenRingApp;
  let service: FileSystemService;
  let agent: ReturnType<typeof createTestingAgent>;
  let provider: ReturnType<typeof createMockProvider>;
  let approved: boolean;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "tr-file-delete-"));
    tempDirs.push(workspace);
    app = new TokenRingApp({
      app: {
        workingDirectory: workspace,
        workspaceDirectory: workspace,
        configDirectories: [],
        shutdownMonitorIntervalMs: 2000,
        serviceRestartDelayMs: 5000,
        printLogs: false,
      },
    });
    provider = createMockProvider({ [path.join(workspace, "doomed.txt")]: "bye" });
    service = new FileSystemService(
      app,
      FileSystemConfigSchema.parse({
        agentDefaults: { provider: "mock", selectedFiles: [] },
        allowedPaths: [{ path: workspace, permission: "write" }],
      }),
    );
    service.registerFileSystemProvider("mock", provider as never);
    app.addService(FileSystemService, service);
    // Deletion is gated behind the chat tool-approval flow; stub the decision.
    approved = true;
    app.addService(ChatService, {
      checkToolApproval: async () => approved,
    } as never);
    service.start();

    agent = createTestingAgent(app);
    service.attach(agent, { items: [] } as never);
  });

  afterEach(() => {
    app.shutdown();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("deletes an existing file and reports it", async () => {
    const target = path.join(workspace, "doomed.txt");
    const result = await deleteTool.execute({ path: target }, agent);
    expect(result.failed ?? false).toBe(false);
    expect(result.message).toContain(`Deleted ${target}`);
    expect(provider.files.has(target)).toBe(false);
  });

  test("fails gracefully for missing files", async () => {
    const result = await deleteTool.execute({ path: path.join(workspace, "missing.txt") }, agent);
    expect(result.failed).toBe(true);
    expect(result.message).toContain("File not found");
  });

  test("does not delete when the user rejects the approval prompt", async () => {
    approved = false;
    const target = path.join(workspace, "doomed.txt");
    const result = await deleteTool.execute({ path: target }, agent);
    expect(result.failed).toBe(true);
    expect(result.message).toContain("Not approved");
    expect(provider.files.has(target)).toBe(true);
  });
});

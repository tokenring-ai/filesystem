import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import TokenRingApp from "@tokenring-ai/app";
import ChatService, { type CheckToolApprovalOptions } from "@tokenring-ai/chat/ChatService";
import FileSystemService from "./FileSystemService.ts";
import { AllowedPathSchema, FileSystemConfigSchema } from "./schema.ts";
import appendTool from "./tools/append.ts";
import editTool from "./tools/edit.ts";
import writeTool from "./tools/write.ts";

function createMockProvider() {
  const files = new Map<string, Buffer>();
  const toBuffer = (content: string | Buffer) => (Buffer.isBuffer(content) ? content : Buffer.from(content));
  return {
    files,
    async *getDirectoryTree() {},
    async writeFile(p: string, content: string | Buffer) {
      files.set(p, toBuffer(content));
      return true;
    },
    async appendFile(p: string, content: string | Buffer) {
      files.set(p, Buffer.concat([files.get(p) ?? Buffer.alloc(0), toBuffer(content)]));
      return true;
    },
    async readFile(p: string) {
      return files.get(p) ?? null;
    },
    async realpath(p: string) {
      return p;
    },
    async stat(p: string) {
      const current = files.get(p);
      if (!current) return { path: p, exists: false as const };
      return { path: p, exists: true as const, isFile: true, size: current.length, modified: new Date() };
    },
    async createDirectory() {
      return true;
    },
  };
}

describe("archiving writes to any allowed path", () => {
  const tempDirs: string[] = [];
  let workspace: string;
  let projectA: string;
  let projectB: string;
  let app: TokenRingApp;
  let service: FileSystemService;
  let provider: ReturnType<typeof createMockProvider>;
  let asked: CheckToolApprovalOptions[];

  const mkdir = (prefix: string) => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    tempDirs.push(dir);
    return dir;
  };

  beforeEach(() => {
    workspace = mkdir("tr-arch-ws-");
    projectA = mkdir("tr-arch-a-");
    projectB = mkdir("tr-arch-b-");
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
    service = new FileSystemService(
      app,
      FileSystemConfigSchema.parse({
        agentDefaults: { selectedFiles: [] },
        allowedPaths: [
          { path: projectA, permission: "write" },
          { path: projectB, permission: "write", approvalLevel: 6 },
        ],
      }),
      provider as never,
    );
    app.addService(FileSystemService, service);
    asked = [];
    app.addService(ChatService, {
      checkToolApproval: async (options: CheckToolApprovalOptions) => {
        asked.push(options);
        return true;
      },
    } as never);
  });

  afterEach(() => {
    app.shutdown();
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  test("write outside the workspace, then list, read and restore", async () => {
    const target = path.join(projectA, "src", "main.ts");
    await service.writeSystemFile(target, "v1");
    await service.writeSystemFile(target, "v2");
    await service.writeSystemFile(target, "v3");

    const versions = await service.listVersions(target);
    expect(versions).toHaveLength(2);
    expect((await service.readVersion(target, versions[1]!.id))?.toString("utf8")).toBe("v1");

    // Restore = writing the old content back; the content it replaces is archived too.
    await service.writeSystemFile(target, (await service.readVersion(target, versions[1]!.id))!.toString("utf8"));
    expect(provider.files.get(target)?.toString("utf8")).toBe("v1");
    const after = await service.listVersions(target);
    expect(after).toHaveLength(3);
    expect((await service.readVersion(target, after[0]!.id))?.toString("utf8")).toBe("v3");
  });

  test("same file name in different places does not collide", async () => {
    const a = path.join(projectA, "README.md");
    const b = path.join(projectB, "README.md");
    await service.writeSystemFile(a, "a1");
    await service.writeSystemFile(a, "a2");
    await service.writeSystemFile(b, "b1");
    await service.writeSystemFile(b, "b2");
    const [va] = await service.listVersions(a);
    const [vb] = await service.listVersions(b);
    expect((await service.readVersion(a, va!.id))?.toString("utf8")).toBe("a1");
    expect((await service.readVersion(b, vb!.id))?.toString("utf8")).toBe("b1");
    expect(await service.readVersion(a, vb!.id)).toBeNull();
  });

  test("archives live under the workspace, never inside the written project", async () => {
    const target = path.join(projectA, "notes.txt");
    await service.writeSystemFile(target, "v1");
    await service.writeSystemFile(target, "v2");
    expect(fs.readdirSync(projectA)).toEqual([]);
    expect(fs.readdirSync(workspace).some(name => name.startsWith(".archive"))).toBe(true);
  });

  test("files outside every allowed path stay inaccessible", async () => {
    const stray = path.join(mkdir("tr-arch-stray-"), "x.txt");
    await service.writeSystemFile(stray, "v1");
    await service.writeSystemFile(stray, "v2");
    expect(await service.listVersions(stray)).toEqual([]);
    expect(fs.readdirSync(workspace)).toEqual([]);
  });

  test("excluded paths inside another allowed path are not archived", async () => {
    const target = path.join(projectA, "node_modules", "dep", "index.js");
    await service.writeSystemFile(target, "v1");
    await service.writeSystemFile(target, "v2");
    expect(await service.listVersions(target)).toEqual([]);
  });

  test("approvalLevel is validated: 1-8 only", () => {
    expect(AllowedPathSchema.parse({ path: "/x" }).approvalLevel).toBeUndefined();
    expect(AllowedPathSchema.parse({ path: "/x", approvalLevel: 8 }).approvalLevel).toBe(8);
    for (const bad of [0, 9, 10, 4.5, "6"]) {
      expect(AllowedPathSchema.safeParse({ path: "/x", approvalLevel: bad }).success).toBe(false);
    }
  });

  test("write tools rate by the covering entry: level 4 by default, raised by approvalLevel", async () => {
    const agent = createTestingAgent(app);
    service.attach(agent, { items: [] } as never);

    await writeTool.execute({ path: path.join(projectA, "a.txt"), content: "x" }, agent);
    await writeTool.execute({ path: path.join(workspace, "w.txt"), content: "x" }, agent);
    await writeTool.execute({ path: path.join(projectB, "b.txt"), content: "x" }, agent);
    await appendTool.execute({ path: path.join(projectB, "b.txt"), content: "y" }, agent);
    await editTool.execute({ path: path.join(projectB, "b.txt"), find: "y", replace: "z", multiple: false }, agent);

    expect(asked.map(option => option.safetyLevel)).toEqual([4, 4, 6, 6, 6]);
    expect(asked[2]?.message).toContain(path.join(projectB, "b.txt"));
    expect(asked[2]?.message).toContain(projectB);
  });

  test("a refused write is not performed", async () => {
    app.requireService(ChatService).checkToolApproval = async () => false;
    const agent = createTestingAgent(app);
    service.attach(agent, { items: [] } as never);
    const target = path.join(projectB, "no.txt");
    await expect(writeTool.execute({ path: target, content: "x" }, agent)).rejects.toThrow(/did not approve/);
    expect(provider.files.has(target)).toBe(false);
  });
});

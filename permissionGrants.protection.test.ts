import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TokenRingApp from "@tokenring-ai/app";
import { TokenRingAppConfigSchema } from "@tokenring-ai/app/schema";
import { MemoryPermissionStore, PermissionService } from "@tokenring-ai/chat";
import FileSystemService from "./FileSystemService.ts";
import { FileSystemConfigSchema } from "./schema.ts";
import { PathNotAllowedError } from "./util/allowedPaths.ts";

// Mirrors backend/tokenring.ts: the launch directory is writable, the workspace directory is implicitly
// writable, and the global overlay is ~/.tokenring/config.yaml. realpath first: macOS temp is behind a symlink.
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tr-grants-")));
const home = path.join(base, "home");
const launch = path.join(base, "project");
const workspace = path.join(home, ".tokenring", "workspaces", "project-1234abcd");
const globalConfigFile = path.join(home, ".tokenring", "config.yaml");
const workspaceConfigFile = path.join(workspace, "config.yaml");
fs.mkdirSync(workspace, { recursive: true });
fs.mkdirSync(launch, { recursive: true });
fs.writeFileSync(globalConfigFile, "# global overlay\n");
fs.writeFileSync(workspaceConfigFile, "# workspace overlay\n");

afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

const app = new TokenRingApp(TokenRingAppConfigSchema.parse({ app: { workingDirectory: launch, workspaceDirectory: workspace, configDirectories: [] } }));

function filesystemFor(allowedPaths: { path: string; permission: "read" | "write" }[]) {
  return new FileSystemService(app, FileSystemConfigSchema.parse({ allowedPaths }));
}

function permissionsFor(fileSystem: FileSystemService) {
  const store = new MemoryPermissionStore({ global: globalConfigFile, workspace: workspaceConfigFile });
  store.scopes.global.push({ id: "blog.mysite.publish", grantedAt: "2026-11-16T09:12:00Z" });
  store.scopes.workspace.push({ id: "x.acct.post", grantedAt: "2026-11-16T09:12:00Z" });
  const service = new PermissionService(app, store);
  service.setWritableRootsProvider(() => fileSystem.getWritablePaths());
  return service;
}

describe("permission grants and the agents' file tools", () => {
  it("default config: the global overlay (~/.tokenring/config.yaml) is not writable or readable by file tools", async () => {
    const fileSystem = filesystemFor([{ path: launch, permission: "write" }]);
    await expect(fileSystem.authorizePath(globalConfigFile, "write")).rejects.toBeInstanceOf(PathNotAllowedError);
    await expect(fileSystem.authorizePath(globalConfigFile, "read")).rejects.toBeInstanceOf(PathNotAllowedError);
    expect(await fileSystem.authorizePath(path.join(launch, "notes.md"), "write")).toBe(path.join(launch, "notes.md"));
  });

  it("default config: the global grants are trusted", () => {
    const service = permissionsFor(filesystemFor([{ path: launch, permission: "write" }]));
    expect(service.untrustedReason("global")).toBeUndefined();
    expect(service.matches("blog.mysite.publish")).toBeDefined();
  });

  it("default config: the workspace overlay sits in the implicitly writable workspace directory, so its grants are NOT trusted", async () => {
    const fileSystem = filesystemFor([{ path: launch, permission: "write" }]);
    expect(await fileSystem.authorizePath(workspaceConfigFile, "write")).toBe(workspaceConfigFile);
    const service = permissionsFor(fileSystem);
    expect(service.untrustedReason("workspace")).toMatch(/agents' file tools can write/);
    expect(service.matches("x.acct.post")).toBeUndefined();
  });

  it("launching from the home directory makes the global overlay writable, and its grants are refused", async () => {
    const fileSystem = filesystemFor([{ path: home, permission: "write" }]);
    expect(await fileSystem.authorizePath(globalConfigFile, "write")).toBe(globalConfigFile);
    const service = permissionsFor(fileSystem);
    expect(service.untrustedReason("global")).toMatch(/agents' file tools can write/);
    expect(service.matches("blog.mysite.publish")).toBeUndefined();
    await expect(service.grant({ id: "x.acct.post" })).rejects.toThrow(/Permissions can't be saved/);
  });

  it("a read-only allowed folder does not make the overlay untrusted", () => {
    const service = permissionsFor(filesystemFor([{ path: home, permission: "read" }]));
    expect(service.untrustedReason("global")).toBeUndefined();
  });
});

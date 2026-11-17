import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import FileSystemService from "./FileSystemService.ts";
import RemoteStoreService from "./remote/RemoteStoreService.ts";
import remoteRPC from "./rpc/remote.ts";
import { FileSystemConfigSchema } from "./schema.ts";

// Real files and symlinks: the allow-list must hold for what a walk actually reads, not just its root.
// realpath first, since macOS's temp directory is itself behind a symlink (/var -> /private/var).
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tr-allowlist-")));
const root = path.join(base, "root");
const outside = path.join(base, "outside");
fs.mkdirSync(path.join(outside, "dir"), { recursive: true });
fs.mkdirSync(root);
fs.writeFileSync(path.join(outside, "secret.txt"), "TOPSECRET outside\n");
fs.writeFileSync(path.join(outside, "dir", "nested.txt"), "TOPSECRET nested\n");
fs.writeFileSync(path.join(root, "own.txt"), "TOPSECRET inside\n");
fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
fs.symlinkSync(path.join(outside, "dir"), path.join(root, "linkdir"));

afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

const app = createTestingApp();
const fileSystem = new FileSystemService(
  app,
  FileSystemConfigSchema.parse({ agentDefaults: { selectedFiles: [] }, allowedPaths: [{ path: root, permission: "write" }] }),
);

describe("allow-list on the real filesystem", () => {
  it("content search does not read through symlinks that leave the allowed folders", async () => {
    const { matches } = await fileSystem.searchContents("TOPSECRET", { cwd: root, maxResults: 10 });
    expect(matches.map(match => path.relative(root, match.file))).toEqual(["own.txt"]);
  });

  it("copying a remote file to the host is held to the allow-list", async () => {
    const services = new Map<unknown, unknown>([
      [FileSystemService, fileSystem],
      [RemoteStoreService, { read: async () => ({ name: "doc.md", mimeType: "text/markdown", content: Buffer.from("# remote") }) }],
    ]);
    const rpcApp = { requireService: (type: unknown) => services.get(type) } as unknown as TokenRingApp;
    const copy = (target: string) => remoteRPC.methods.copyToHost.execute({ url: "fake://work/doc", path: target, overwrite: true }, rpcApp);

    await expect(copy(path.join(outside, "copied.md"))).rejects.toThrow(/outside the allowed directories/);
    await expect(copy(path.join(root, "linkdir", "copied.md"))).rejects.toThrow(/outside the allowed directories/);
    expect(fs.existsSync(path.join(outside, "copied.md"))).toBe(false);
    expect(fs.existsSync(path.join(outside, "dir", "copied.md"))).toBe(false);

    expect(await copy(path.join(root, "copied.md"))).toMatchObject({ path: path.join(root, "copied.md"), size: 8 });
    expect(fs.readFileSync(path.join(root, "copied.md"), "utf-8")).toBe("# remote");
  });
});

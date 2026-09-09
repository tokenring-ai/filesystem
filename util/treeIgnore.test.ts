import { describe, expect, it } from "bun:test";
import { isIgnoreFile, TreeIgnore, type TreeIgnoreIO } from "./treeIgnore.ts";

function ioFor(files: Record<string, string>): TreeIgnoreIO {
  return {
    readFile: (path: string) => (files[path] != null ? Buffer.from(files[path]) : null),
    exists: (path: string) => files[path] != null,
  };
}

describe("TreeIgnore", () => {
  it("always prunes .git even with includeHidden", async () => {
    const ignore = new TreeIgnore("/repo", { includeHidden: true }, ioFor({}));
    expect(await ignore.shouldIgnore("/repo/.git", true)).toBe(true);
  });

  it("skips dotfiles unless includeHidden", async () => {
    const io = ioFor({});
    expect(await new TreeIgnore("/repo", {}, io).shouldIgnore("/repo/.env", false)).toBe(true);
    expect(await new TreeIgnore("/repo", { includeHidden: true }, io).shouldIgnore("/repo/.env", false)).toBe(false);
  });

  it("honors the root .gitignore", async () => {
    const io = ioFor({ "/repo/.gitignore": "node_modules\n*.log\n" });
    const ignore = new TreeIgnore("/repo", {}, io);
    expect(await ignore.shouldIgnore("/repo/node_modules", true)).toBe(true);
    expect(await ignore.shouldIgnore("/repo/app.log", false)).toBe(true);
    expect(await ignore.shouldIgnore("/repo/src/deep/app.log", false)).toBe(true);
    expect(await ignore.shouldIgnore("/repo/src/app.ts", false)).toBe(false);
  });

  it("honors nested .gitignore files relative to their own directory", async () => {
    const io = ioFor({ "/repo/sub/.gitignore": "dist\n" });
    const ignore = new TreeIgnore("/repo", {}, io);
    expect(await ignore.shouldIgnore("/repo/sub/dist", true)).toBe(true);
    expect(await ignore.shouldIgnore("/repo/dist", true)).toBe(false);
  });

  it("supports negation within a file", async () => {
    const io = ioFor({ "/repo/.gitignore": "*.log\n!keep.log\n" });
    const ignore = new TreeIgnore("/repo", {}, io);
    expect(await ignore.shouldIgnore("/repo/app.log", false)).toBe(true);
    expect(await ignore.shouldIgnore("/repo/keep.log", false)).toBe(false);
  });

  it("gitignore: false exposes node_modules", async () => {
    const io = ioFor({ "/repo/.gitignore": "node_modules\n" });
    const ignore = new TreeIgnore("/repo", { gitignore: false }, io);
    expect(await ignore.shouldIgnore("/repo/node_modules", true)).toBe(false);
  });

  it("honors .aiignore independently", async () => {
    const io = ioFor({ "/repo/.aiignore": "secrets\n" });
    expect(await new TreeIgnore("/repo", {}, io).shouldIgnore("/repo/secrets", true)).toBe(true);
    expect(await new TreeIgnore("/repo", { aiignore: false }, io).shouldIgnore("/repo/secrets", true)).toBe(false);
  });

  it("a fresh walk sees ignore-file edits (per-walk cache)", async () => {
    const files: Record<string, string> = { "/repo/.gitignore": "" };
    const first = new TreeIgnore("/repo", {}, ioFor(files));
    expect(await first.shouldIgnore("/repo/build", true)).toBe(false);
    files["/repo/.gitignore"] = "build\n";
    const second = new TreeIgnore("/repo", {}, ioFor(files));
    expect(await second.shouldIgnore("/repo/build", true)).toBe(true);
  });
});

describe("isIgnoreFile", () => {
  it("matches .gitignore and .aiignore anywhere", () => {
    expect(isIgnoreFile("/repo/sub/.gitignore")).toBe(true);
    expect(isIgnoreFile("/repo/.aiignore")).toBe(true);
    expect(isIgnoreFile("/repo/readme.md")).toBe(false);
  });
});

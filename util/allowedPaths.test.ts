import { describe, expect, it } from "bun:test";
import type { AllowedPath } from "../schema.ts";
import { allowedPathsFor, authorizePath, findAllowedRoot, PathNotAllowedError, pathIsWithin, topLevelRoots } from "./allowedPaths.ts";

const baseOptions = {};

function entries(...items: Array<Partial<AllowedPath> & { path: string }>): AllowedPath[] {
  return items.map(item => ({ permission: "write", ...item }) as AllowedPath);
}

describe("pathIsWithin", () => {
  it("contains itself and children", () => {
    expect(pathIsWithin("/proj", "/proj")).toBe(true);
    expect(pathIsWithin("/proj", "/proj/src/a.ts")).toBe(true);
  });

  it("does not match sibling prefixes (/foo vs /foobar)", () => {
    expect(pathIsWithin("/foo", "/foobar")).toBe(false);
    expect(pathIsWithin("/foo", "/foobar/x")).toBe(false);
  });

  it("does not match parents", () => {
    expect(pathIsWithin("/proj/src", "/proj")).toBe(false);
  });
});

describe("authorizePath", () => {
  it("rejects relative paths", async () => {
    await expect(authorizePath("src/a.ts", "read", { ...baseOptions, entries: entries({ path: "/proj" }) })).rejects.toThrow(PathNotAllowedError);
  });

  it("rejects paths outside every root", async () => {
    await expect(authorizePath("/etc/passwd", "read", { ...baseOptions, entries: entries({ path: "/proj" }) })).rejects.toThrow(/allowed/);
  });

  it("normalizes traversal attempts before checking", async () => {
    await expect(authorizePath("/proj/../etc/passwd", "read", { ...baseOptions, entries: entries({ path: "/proj" }) })).rejects.toThrow(/allowed/);
  });

  it("write implies read", async () => {
    expect(await authorizePath("/proj/a.ts", "read", { ...baseOptions, entries: entries({ path: "/proj", permission: "write" }) })).toBe("/proj/a.ts");
  });

  it("read-only roots reject writes", async () => {
    const opts = { ...baseOptions, entries: entries({ path: "/notes", permission: "read" }) };
    expect(await authorizePath("/notes/a.md", "read", opts)).toBe("/notes/a.md");
    await expect(authorizePath("/notes/a.md", "write", opts)).rejects.toThrow(/read-only/);
  });

  it("most-specific root wins for overlapping entries", async () => {
    const opts = {
      ...baseOptions,
      entries: entries({ path: "/proj", permission: "write" }, { path: "/proj/vendor", permission: "read" }),
    };
    expect(await authorizePath("/proj/src/a.ts", "write", opts)).toBe("/proj/src/a.ts");
    await expect(authorizePath("/proj/vendor/lib.js", "write", opts)).rejects.toThrow(/read-only/);
  });

  it("implicitly write-allows the workspace directory", async () => {
    const opts = { ...baseOptions, entries: [], workspaceDirectory: "/workspace" };
    expect(await authorizePath("/workspace/media/x.png", "write", opts)).toBe("/workspace/media/x.png");
    await expect(authorizePath("/elsewhere/x.png", "write", opts)).rejects.toThrow(/allowed/);
  });

  it("re-checks symlink targets via realpath", async () => {
    const realpath = async (p: string) => p.replace("/proj/link", "/outside/secret");
    const opts = { ...baseOptions, entries: entries({ path: "/proj" }), realpath };
    await expect(authorizePath("/proj/link/a.ts", "read", opts)).rejects.toThrow(/allowed/);
    expect(await authorizePath("/proj/src/a.ts", "read", { ...opts, realpath: async p => p })).toBe("/proj/src/a.ts");
  });

  it("allows files in a root that is itself behind a symlink, like macOS /tmp", async () => {
    // /tmp is a symlink to /private/tmp, so every path under it resolves there, the root included.
    const realpath = async (p: string) => p.replace(/^\/tmp(?=\/|$)/, "/private/tmp");
    const opts = { ...baseOptions, entries: entries({ path: "/tmp" }), realpath };
    expect(await authorizePath("/tmp/work/a.txt", "write", opts)).toBe("/tmp/work/a.txt");
    // A link inside it that leaves every root is still refused.
    const escaping = async (p: string) => (p.startsWith("/tmp/link") ? p.replace("/tmp/link", "/etc") : p.replace(/^\/tmp(?=\/|$)/, "/private/tmp"));
    await expect(authorizePath("/tmp/link/passwd", "read", { ...opts, realpath: escaping })).rejects.toThrow(/allowed/);
  });
});

describe("topLevelRoots", () => {
  it("drops entries nested inside other entries", () => {
    const list = entries({ path: "/proj" }, { path: "/proj/vendor", permission: "read" }, { path: "/notes", permission: "read" });
    expect(topLevelRoots(list).map(entry => entry.path)).toEqual(["/proj", "/notes"]);
  });
});

describe("findAllowedRoot / allowedPathsFor", () => {
  it("returns the longest matching root", () => {
    const list = entries({ path: "/proj" }, { path: "/proj/vendor", permission: "read" });
    expect(findAllowedRoot("/proj/vendor/a.js", list)?.path).toBe("/proj/vendor");
  });

  it("appends the workspace entry once", () => {
    const list = allowedPathsFor({
      ...baseOptions,
      entries: entries({ path: "/proj" }),
      workspaceDirectory: "/workspace",
    });
    expect(list.map(entry => entry.path)).toEqual(["/proj", "/workspace"]);
    expect(list[1]?.permission).toBe("write");
  });
});

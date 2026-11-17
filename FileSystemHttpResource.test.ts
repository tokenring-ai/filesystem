import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import SessionStore, { parseCookie, SESSION_COOKIE } from "@tokenring-ai/web-host/sessionStore";
import { loginRateLimiter } from "@tokenring-ai/web-host/util/authSecurity";
import FileSystemHttpResource from "./FileSystemHttpResource.ts";
import FileSystemService from "./FileSystemService.ts";
import type { StatLike } from "./FileSystemTypes.ts";
import type HostFileSystem from "./HostFileSystem.ts";

const stubApp = { appConfig: { workspaceDirectory: "/tmp/fs-http-workspace" } } as unknown as TokenRingApp;

const AUTH_USERS = {
  alice: { password: "secret-pass" },
};

function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

const WORKSPACE = "/tmp/fs-http-workspace";

/** In-memory host. Keys are absolute, or relative to the workspace directory. */
function createMockHost(files: Record<string, Buffer | string>, options?: { absolute?: boolean }) {
  const map = new Map(Object.entries(files).map(([k, v]) => [path.isAbsolute(k) ? k : path.join(WORKSPACE, k), typeof v === "string" ? Buffer.from(v) : v]));

  return {
    async realpath(filePath: string) {
      return filePath;
    },
    async *getDirectoryTree() {},
    async writeFile(filePath: string, content: string | Buffer) {
      map.set(filePath, typeof content === "string" ? Buffer.from(content) : content);
      return true;
    },
    async appendFile() {
      return true;
    },
    async deleteFile() {
      return true;
    },
    async readFile(filePath: string) {
      return map.get(filePath) ?? null;
    },
    async rename() {
      return true;
    },
    async exists(filePath: string) {
      return map.has(filePath);
    },
    async stat(filePath: string): Promise<StatLike> {
      if (!map.has(filePath)) return { path: filePath, exists: false };
      return {
        path: filePath,
        exists: true,
        isFile: true,
        isDirectory: false,
        size: map.get(filePath)!.byteLength,
        ...(options?.absolute ? { absolutePath: filePath } : {}),
      };
    },
    async createDirectory() {
      return true;
    },
    async copy() {
      return true;
    },
  };
}

function makeFs(files: Record<string, Buffer | string>, host: unknown = createMockHost(files)): FileSystemService {
  return new FileSystemService(stubApp, undefined, host as HostFileSystem);
}

/** Stands in for the web host's sign-in sessions (`/api/auth/session`). */
const webHostSessions = new SessionStore();

function makeApp(fsService: FileSystemService, authUsers = AUTH_USERS): TokenRingApp {
  return {
    requireService(ctor: { name?: string }) {
      if (ctor === FileSystemService || ctor?.name === "FileSystemService") return fsService;
      if (ctor?.name === "WebHostService") {
        return {
          getAuthConfig: () => ({ users: authUsers }),
          resolveSessionUsername: (request: Request) => webHostSessions.resolve(parseCookie(request.headers.get("Cookie"), SESSION_COOKIE)),
        };
      }
      throw new Error(`Unexpected service: ${ctor?.name ?? "<unnamed>"}`);
    },
  } as unknown as TokenRingApp;
}

function handlersFor(app: TokenRingApp, prefix = "/api/fs") {
  const resource = new FileSystemHttpResource(app, { prefix });
  const fileRoute = resource.routes[`${prefix}/*`];
  if (typeof fileRoute !== "function") {
    throw new Error("expected a route handler function");
  }
  return { file: fileRoute as (request: Request) => Promise<Response> };
}

function authHeaders(username = "alice", password = "secret-pass"): Record<string, string> {
  return { Authorization: basicAuth(username, password) };
}

describe("FileSystemHttpResource", () => {
  let tmpDir: string;
  let localFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-http-"));
    localFile = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(localFile, "hello-stream");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    loginRateLimiter.reset();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const fsService = makeFs({ "a.txt": "x" });
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(new Request("http://localhost/api/fs/a.txt"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("rejects invalid credentials", async () => {
    const fsService = makeFs({ "a.txt": "x" });
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/a.txt", {
        headers: authHeaders("alice", "wrong"),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("locks the client out with 429 after repeated failed logins", async () => {
    const fsService = makeFs({ "a.txt": "x" });
    const { file } = handlersFor(makeApp(fsService));

    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await file(new Request("http://localhost/api/fs/a.txt", { headers: authHeaders("alice", `wrong-${attempt}`) }));
      expect(response.status).toBe(401);
    }

    const blocked = await file(new Request("http://localhost/api/fs/a.txt", { headers: authHeaders() }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("serves a file with valid Basic auth", async () => {
    const fsService = makeFs({ "media-library/panda.png": "PNGDATA" });
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/media-library/panda.png", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    // No cookie of its own: browsers ride on the web host's sign-in cookie.
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.text()).toBe("PNGDATA");
  });

  it("serves HTML and SVG sandboxed, so a page an agent wrote cannot act as the signed-in user", async () => {
    const fsService = makeFs({ "page.html": "<script>fetch('/rpc')</script>", "icon.svg": "<svg/>", "photo.png": "PNG" });
    const { file } = handlersFor(makeApp(fsService));
    const get = (name: string) => file(new Request(`http://localhost/api/fs/${name}`, { headers: authHeaders() }));

    for (const name of ["page.html", "icon.svg"]) {
      const csp = (await get(name)).headers.get("Content-Security-Policy") ?? "";
      expect(csp).toStartWith("sandbox");
      expect(csp).not.toContain("allow-same-origin");
    }
    expect((await get("photo.png")).headers.get("Content-Security-Policy")).toBeNull();
  });

  it("supports HEAD without a body", async () => {
    const fsService = makeFs({ "a.txt": "abc" });
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/a.txt", {
        method: "HEAD",
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(await response.text()).toBe("");
  });

  it("returns 404 for missing file", async () => {
    const fsService = makeFs({});
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/nope.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("rejects null bytes and backslashes in the path", async () => {
    const fsService = makeFs({ "a.txt": "ok" });
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/a%5Ctxt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("sets Content-Disposition when download=1", async () => {
    const fsService = makeFs({ "docs/report.pdf": "%PDF" });
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/docs/report.pdf?download=1", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    const cd = response.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("report.pdf");
  });

  it("streams local files via Bun.file when absolutePath is set", async () => {
    // Relative URLs resolve against the workspace directory.
    const virtualPath = "/tmp/fs-http-workspace/streamed/hello.txt";
    const host = createMockHost({ [virtualPath]: "ignored-buffer" });
    host.stat = async (filePath: string): Promise<StatLike> => {
      if (filePath !== virtualPath) return { path: filePath, exists: false };
      return {
        path: filePath,
        exists: true,
        isFile: true,
        absolutePath: localFile,
      };
    };
    host.readFile = async () => {
      throw new Error("readFile should not be used when absolutePath streams");
    };
    const fsService = makeFs({}, host);

    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/streamed/hello.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello-stream");
  });

  it("preserves an absolute path instead of resolving it against the workspace directory", async () => {
    // Inside the workspace directory but addressed absolutely — this only
    // resolves correctly if the leading slash survives the URL round-trip intact.
    const absolutePath = "/tmp/fs-http-workspace/notes/todo.md";
    const fsService = makeFs({ [absolutePath]: "buy milk" });

    const { file } = handlersFor(makeApp(fsService));
    // Mirrors what frontend/src/lib/workspaceFileUrl.ts produces for an absolute path:
    // the leading slash is kept, appearing as a doubled slash after the prefix.
    const response = await file(
      new Request(`http://localhost/api/fs/${absolutePath}`, {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("buy milk");
  });

  it("authorizes every request: absolute paths outside the allowed roots get 403", async () => {
    // Outside the workspace directory (/tmp/fs-http-workspace) entirely.
    const fsService = makeFs({ "/etc/passwd": "root:x:0:0:" });

    const { file } = handlersFor(makeApp(fsService));
    const response = await file(new Request("http://localhost/api/fs//etc/passwd", { headers: authHeaders() }));
    expect(response.status).toBe(403);

    const put = await file(
      new Request("http://localhost/api/fs//etc/passwd", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "text/plain" },
        body: "pwned",
      }),
    );
    expect(put.status).toBe(403);
  });

  it("rejects symlinks that escape the workspace with 403", async () => {
    const host = createMockHost({ "link/secret.txt": "top-secret", "/outside/secret.txt": "top-secret" });
    host.realpath = async (filePath: string) => filePath.replace(`${WORKSPACE}/link`, "/outside");
    const { file } = handlersFor(makeApp(makeFs({}, host)));

    const response = await file(new Request("http://localhost/api/fs/link/secret.txt", { headers: authHeaders() }));
    expect(response.status).toBe(403);
  });

  it("rejects .. traversal with 403", async () => {
    const { file } = handlersFor(makeApp(makeFs({ "a.txt": "x" })));
    const response = await file(new Request("http://localhost/api/fs/../etc/passwd", { headers: authHeaders() }));
    expect([403, 404]).toContain(response.status);
    const encoded = await file(new Request("http://localhost/api/fs/notes/%2e%2e/%2e%2e/etc/passwd", { headers: authHeaders() }));
    // The URL parser collapses the dots before the handler runs; either way nothing is served.
    expect([403, 404]).toContain(encoded.status);
  });

  it("returns 405 for unsupported methods", async () => {
    const fsService = makeFs({ "a.txt": "a" });
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/a.txt", {
        method: "POST",
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(405);
  });

  it("decodes URI-encoded path segments", async () => {
    const fsService = makeFs({ "a b.png": "IMG" });
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/a%20b.png", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("IMG");
  });

  it("accepts PUT uploads with Basic auth", async () => {
    const fsService = makeFs({});
    const { file } = handlersFor(makeApp(fsService));

    const put = await file(
      new Request("http://localhost/api/fs/uploads/note.txt", {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "text/plain",
        },
        body: "hello upload",
      }),
    );
    expect(put.status).toBe(201);

    const get = await file(
      new Request("http://localhost/api/fs/uploads/note.txt", {
        headers: authHeaders(),
      }),
    );
    expect(get.status).toBe(200);
    expect(await get.text()).toBe("hello upload");
  });

  it("accepts the web host's sign-in session cookie", async () => {
    const fsService = makeFs({ "a.txt": "cookie-ok" });
    const { file } = handlersFor(makeApp(fsService));
    const sessionId = webHostSessions.create("alice");

    const response = await file(new Request("http://localhost/api/fs/a.txt", { headers: { Cookie: `${SESSION_COOKIE}=${sessionId}` } }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("cookie-ok");
  });

  it("refuses an unknown or signed-out session cookie", async () => {
    const fsService = makeFs({ "a.txt": "cookie-ok" });
    const { file } = handlersFor(makeApp(fsService));

    const unknown = await file(new Request("http://localhost/api/fs/a.txt", { headers: { Cookie: `${SESSION_COOKIE}=not-a-session` } }));
    expect(unknown.status).toBe(401);

    // Sign-out revokes the web host session, which must end media access too.
    const sessionId = webHostSessions.create("alice");
    webHostSessions.revoke(sessionId);
    const revoked = await file(new Request("http://localhost/api/fs/a.txt", { headers: { Cookie: `${SESSION_COOKIE}=${sessionId}` } }));
    expect(revoked.status).toBe(401);
  });

  it("no longer serves a separate /api/fs/session endpoint", () => {
    const resource = new FileSystemHttpResource(makeApp(makeFs({})), { prefix: "/api/fs" });
    expect(resource.routes["/api/fs/session"]).toBeUndefined();
  });

  it("returns 503 when web-host auth is not configured", async () => {
    const fsService = makeFs({ "a.txt": "x" });
    const app = {
      requireService(ctor: { name?: string }) {
        if (ctor === FileSystemService || ctor?.name === "FileSystemService") return fsService;
        if (ctor?.name === "WebHostService") {
          return {
            getAuthConfig: () => {
              throw new Error("not configured");
            },
          };
        }
        throw new Error("unexpected");
      },
    } as unknown as TokenRingApp;

    const { file } = handlersFor(app);
    const response = await file(
      new Request("http://localhost/api/fs/a.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(503);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import FileSystemHttpResource from "./FileSystemHttpResource.ts";
import type { FileSystemProvider, StatLike } from "./FileSystemProvider.ts";
import FileSystemService from "./FileSystemService.ts";

const AUTH_USERS = {
  alice: { password: "secret-pass" },
};

function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function createMockProvider(files: Record<string, Buffer | string>, options?: { absolute?: boolean }): FileSystemProvider {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? Buffer.from(v) : v]));

  return {
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

function makeApp(fsService: FileSystemService, authUsers = AUTH_USERS): TokenRingApp {
  return {
    requireService(ctor: { name?: string }) {
      if (ctor === FileSystemService || ctor?.name === "FileSystemService") return fsService;
      if (ctor?.name === "WebHostService") {
        return {
          getAuthConfig: () => ({ users: authUsers }),
        };
      }
      throw new Error(`Unexpected service: ${String(ctor?.name ?? ctor)}`);
    },
  } as unknown as TokenRingApp;
}

function handlersFor(app: TokenRingApp, prefix = "/api/fs") {
  const resource = new FileSystemHttpResource(app, { prefix });
  const fileRoute = resource.routes[`${prefix}/*`];
  const sessionRoute = resource.routes[`${prefix}/session`];
  if (typeof fileRoute !== "function" || typeof sessionRoute !== "function") {
    throw new Error("expected route handler functions");
  }
  return {
    file: fileRoute as (request: Request) => Promise<Response>,
    session: sessionRoute as (request: Request) => Promise<Response>,
  };
}

function authHeaders(username = "alice", password = "secret-pass"): HeadersInit {
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

  it("rejects unauthenticated requests with 401", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "x" }));
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(new Request("http://localhost/api/fs/mock/a.txt"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("rejects invalid credentials", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "x" }));
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/mock/a.txt", {
        headers: authHeaders("alice", "wrong"),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("serves a file with valid Basic auth", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "media-library/panda.png": "PNGDATA" }));
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/mock/media-library/panda.png", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Set-Cookie")).toContain("tokenring_fs_session=");
    expect(await response.text()).toBe("PNGDATA");
  });

  it("supports HEAD without a body", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "abc" }));
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/mock/a.txt", {
        method: "HEAD",
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(await response.text()).toBe("");
  });

  it("returns 404 for unknown provider", async () => {
    const fsService = new FileSystemService();
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/missing/file.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for missing file", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({}));
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/mock/nope.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("rejects null bytes and backslashes in the path", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "ok" }));
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/mock/a%5Ctxt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("sets Content-Disposition when download=1", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "docs/report.pdf": "%PDF" }));
    const { file } = handlersFor(makeApp(fsService));

    const response = await file(
      new Request("http://localhost/api/fs/mock/docs/report.pdf?download=1", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    const cd = response.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("report.pdf");
  });

  it("streams local files via Bun.file when absolutePath is set", async () => {
    const fsService = new FileSystemService();
    const virtualPath = "streamed/hello.txt";
    const provider = createMockProvider({ [virtualPath]: "ignored-buffer" });
    provider.stat = async (filePath: string): Promise<StatLike> => {
      if (filePath !== virtualPath) return { path: filePath, exists: false };
      return {
        path: filePath,
        exists: true,
        isFile: true,
        absolutePath: localFile,
      };
    };
    provider.readFile = async () => {
      throw new Error("readFile should not be used when absolutePath streams");
    };
    fsService.registerFileSystemProvider("posix", provider);

    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/posix/streamed/hello.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello-stream");
  });

  it("returns 405 for unsupported methods", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "a" }));
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/mock/a.txt", {
        method: "POST",
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(405);
  });

  it("decodes URI-encoded path segments", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a b.png": "IMG" }));
    const { file } = handlersFor(makeApp(fsService));
    const response = await file(
      new Request("http://localhost/api/fs/mock/a%20b.png", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("IMG");
  });

  it("accepts PUT uploads with Basic auth", async () => {
    const fsService = new FileSystemService();
    const provider = createMockProvider({});
    fsService.registerFileSystemProvider("mock", provider);
    const { file } = handlersFor(makeApp(fsService));

    const put = await file(
      new Request("http://localhost/api/fs/mock/uploads/note.txt", {
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
      new Request("http://localhost/api/fs/mock/uploads/note.txt", {
        headers: authHeaders(),
      }),
    );
    expect(get.status).toBe(200);
    expect(await get.text()).toBe("hello upload");
  });

  it("establishes a session cookie and accepts cookie auth on later requests", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "cookie-ok" }));
    const { file, session } = handlersFor(makeApp(fsService));

    const sessionRes = await session(
      new Request("http://localhost/api/fs/session", {
        method: "POST",
        headers: authHeaders(),
      }),
    );
    expect(sessionRes.status).toBe(200);
    const setCookie = sessionRes.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("tokenring_fs_session=");
    const sessionId = /tokenring_fs_session=([^;]+)/.exec(setCookie)?.[1];
    expect(sessionId).toBeTruthy();

    const response = await file(
      new Request("http://localhost/api/fs/mock/a.txt", {
        headers: { Cookie: `tokenring_fs_session=${sessionId}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("cookie-ok");
  });

  it("returns 503 when web-host auth is not configured", async () => {
    const fsService = new FileSystemService();
    fsService.registerFileSystemProvider("mock", createMockProvider({ "a.txt": "x" }));
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
      new Request("http://localhost/api/fs/mock/a.txt", {
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(503);
  });
});

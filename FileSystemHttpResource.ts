import fs from "node:fs/promises";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import { type ParsedWebHostAuthConfig, WebHostService, type WebResource } from "@tokenring-ai/web-host";
import mime from "mime-types";
import type { FileSystemProvider } from "./FileSystemProvider.ts";
import FileSystemService from "./FileSystemService.ts";

const DEFAULT_PREFIX = "/api/fs";
const SESSION_COOKIE = "tokenring_fs_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_METHODS = "GET, HEAD, PUT";

export type FileSystemHttpResourceOptions = {
  /** URL prefix, e.g. `/api/fs`. Paths are `/api/fs/{provider}/{path...}`. */
  prefix?: string;
};

/** RFC 5987-ish filename for Content-Disposition (ASCII fallback + UTF-8). */
function contentDispositionAttachment(filename: string): string {
  const baseName = path.basename(filename) || "download";
  const ascii = baseName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(baseName).replace(/['()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function guessMimeType(filePath: string): string {
  const looked = mime.lookup(filePath);
  return looked || "application/octet-stream";
}

function unauthorizedResponse(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TokenRing", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return rest.join("=");
  }
  return undefined;
}

function parseBasicCredentials(header: string | null): { username: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice("Basic ".length).trim());
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

function credentialsValid(auth: ParsedWebHostAuthConfig, username: string, password: string): boolean {
  return auth.users[username]?.password === password;
}

function sessionCookieHeader(sessionId: string, maxAgeSeconds: number): string {
  // Path=/ so media tags, downloads, and iframes under the same origin send the cookie.
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

type ParsedFileTarget = {
  providerName: string;
  filePath: string;
};

/**
 * Serves (and accepts uploads for) files from registered filesystem providers over HTTP.
 *
 * ```
 * GET|HEAD|PUT /api/fs/{provider}/{path...}
 * POST          /api/fs/session   — establish a session cookie from Basic auth
 * ```
 *
 * Always requires authentication (HTTP Basic, or session cookie from a prior Basic login).
 * Optional `?download=1` sets Content-Disposition: attachment.
 * Local files stream via Bun.file when an absolute path is available.
 */
export default class FileSystemHttpResource implements WebResource {
  routes: NonNullable<WebResource["routes"]> = {};
  private readonly sessions = new Map<string, { expiresAt: number }>();

  constructor(
    private readonly app: TokenRingApp,
    options: FileSystemHttpResourceOptions = {},
  ) {
    const prefix = (options.prefix ?? DEFAULT_PREFIX).replace(/\/+$/, "") || DEFAULT_PREFIX;

    this.routes[`${prefix}/session`] = async (request: Request) => {
      if (request.method !== "POST" && request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
      }

      const authResult = this.authenticate(request, { requireBasic: true });
      if (authResult instanceof Response) return authResult;

      const headers = new Headers({
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookieHeader(authResult.sessionId, Math.floor(SESSION_TTL_MS / 1000)),
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    };

    this.routes[`${prefix}/*`] = async (request: Request) => {
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "PUT") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: ALLOWED_METHODS } });
      }

      const authResult = this.authenticate(request);
      if (authResult instanceof Response) return authResult;

      const target = this.parseTarget(request, prefix);
      if (target instanceof Response) return target;

      const { providerName } = target;
      let { filePath } = target;

      let provider: FileSystemProvider;
      try {
        const fileSystemService = this.app.requireService(FileSystemService);
        provider = fileSystemService.requireFileSystemProviderByName(providerName);
        // Relative URLs resolve against the workspace directory for the default
        // (host filesystem) provider; other providers keep their own namespace.
        if (!path.posix.isAbsolute(filePath) && providerName === fileSystemService.getDefaultProviderName()) {
          filePath = fileSystemService.resolvePath(filePath);
        }
      } catch {
        return this.withSessionCookie(new Response("Not Found", { status: 404 }), authResult.sessionId, authResult.renewCookie);
      }

      if (request.method === "PUT") {
        try {
          const body = Buffer.from(await request.arrayBuffer());
          await provider.writeFile(filePath, body);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Upload failed";
          return this.withSessionCookie(new Response(message, { status: 500 }), authResult.sessionId, authResult.renewCookie);
        }
        return this.withSessionCookie(new Response(null, { status: 201 }), authResult.sessionId, authResult.renewCookie);
      }

      const stats = await provider.stat(filePath);
      if (!stats.exists || !stats.isFile) {
        if (!stats.exists) {
          return this.withSessionCookie(new Response("Not Found", { status: 404 }), authResult.sessionId, authResult.renewCookie);
        }
        if (stats.isDirectory) {
          return this.withSessionCookie(new Response("Not Found", { status: 404 }), authResult.sessionId, authResult.renewCookie);
        }
      }

      const url = new URL(request.url);
      const contentType = guessMimeType(filePath);
      const headers = new Headers({
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });

      if (url.searchParams.get("download") === "1") {
        headers.set("Content-Disposition", contentDispositionAttachment(filePath));
      }
      if (authResult.renewCookie) {
        headers.set("Set-Cookie", sessionCookieHeader(authResult.sessionId, Math.floor(SESSION_TTL_MS / 1000)));
      }

      // Prefer streaming local files (media, large binaries).
      // stats.exists is always true here (non-existent paths returned above).
      const absolutePath = "absolutePath" in stats ? stats.absolutePath : undefined;
      if (absolutePath) {
        try {
          const realPath = await fs.realpath(absolutePath);
          const realStats = await fs.stat(realPath);
          if (realStats.isFile()) {
            const file = Bun.file(realPath);
            if (request.method === "HEAD") {
              headers.set("Content-Length", String(realStats.size));
              return new Response(null, { status: 200, headers });
            }
            return new Response(file, { status: 200, headers });
          }
        } catch {
          // Fall through to provider.readFile.
        }
      }

      const content = await provider.readFile(filePath);
      if (content == null) {
        return this.withSessionCookie(new Response("Not Found", { status: 404 }), authResult.sessionId, authResult.renewCookie);
      }

      headers.set("Content-Length", String(content.byteLength));
      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }
      return new Response(new Uint8Array(content), { status: 200, headers });
    };
  }

  private getAuthConfig(): ParsedWebHostAuthConfig | null {
    try {
      return this.app.requireService(WebHostService).getAuthConfig();
    } catch {
      return null;
    }
  }

  /**
   * Validates Basic auth and/or session cookie.
   * On Basic success, creates or refreshes a session cookie id.
   */
  private authenticate(request: Request, options?: { requireBasic?: boolean }): { sessionId: string; renewCookie: boolean } | Response {
    const auth = this.getAuthConfig();
    if (!auth || Object.keys(auth.users).length === 0) {
      // Misconfiguration: refuse rather than open the tree.
      return new Response("Authentication is not configured", { status: 503 });
    }

    this.purgeExpiredSessions();

    const basic = parseBasicCredentials(request.headers.get("Authorization"));
    if (basic && credentialsValid(auth, basic.username, basic.password)) {
      const sessionId = crypto.randomUUID();
      this.sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });
      return { sessionId, renewCookie: true };
    }

    if (options?.requireBasic) {
      return unauthorizedResponse();
    }

    const cookieId = parseCookie(request.headers.get("Cookie"), SESSION_COOKIE);
    if (cookieId) {
      const session = this.sessions.get(cookieId);
      if (session && session.expiresAt > Date.now()) {
        // Sliding expiration
        session.expiresAt = Date.now() + SESSION_TTL_MS;
        return { sessionId: cookieId, renewCookie: false };
      }
      this.sessions.delete(cookieId);
    }

    return unauthorizedResponse();
  }

  private purgeExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }

  private withSessionCookie(response: Response, sessionId: string, renewCookie: boolean): Response {
    if (!renewCookie) return response;
    const headers = new Headers(response.headers);
    headers.set("Set-Cookie", sessionCookieHeader(sessionId, Math.floor(SESSION_TTL_MS / 1000)));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  private parseTarget(request: Request, prefix: string): ParsedFileTarget | Response {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (pathname.includes("\0") || pathname.includes("\\")) {
      return new Response("Bad Request", { status: 400 });
    }

    if (!pathname.startsWith(prefix + "/") && pathname !== prefix) {
      return new Response("Not Found", { status: 404 });
    }

    const rest = pathname.slice(prefix.length).replace(/^\/+/, "");
    if (!rest) {
      return new Response("Not Found", { status: 404 });
    }

    const slash = rest.indexOf("/");
    if (slash <= 0) {
      return new Response("Not Found", { status: 404 });
    }

    const providerName = rest.slice(0, slash);
    let filePath = rest.slice(slash + 1);

    if (!providerName || !filePath) {
      return new Response("Not Found", { status: 404 });
    }

    filePath = path.posix.normalize(filePath);
    if (filePath === ".." || filePath.startsWith("../") || filePath.includes("/../")) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!filePath || filePath === ".") {
      return new Response("Not Found", { status: 404 });
    }

    return { providerName, filePath };
  }
}

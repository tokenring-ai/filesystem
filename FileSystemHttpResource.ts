import fs from "node:fs/promises";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import { type ParsedWebHostAuthConfig, WebHostService, type WebResource } from "@tokenring-ai/web-host";
import { credentialsValid, parseBasicCredentials } from "@tokenring-ai/web-host/sessionStore";
import { LoginRateLimiter, loginRateLimiter } from "@tokenring-ai/web-host/util/authSecurity";
import mime from "mime-types";
import FileSystemService from "./FileSystemService.ts";
import { PathNotAllowedError } from "./util/allowedPaths.ts";

const DEFAULT_PREFIX = "/api/fs";
const ALLOWED_METHODS = "GET, HEAD, PUT";

export type FileSystemHttpResourceOptions = {
  /** URL prefix, e.g. `/api/fs`. Paths are `/api/fs/{path...}`. */
  prefix?: string;
};

/** Types a browser renders as a live document, with scripts. */
const ACTIVE_DOCUMENT_TYPES = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml"]);

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

type ParsedFileTarget = {
  /** Absolute, or relative to the workspace directory. */
  filePath: string;
};

/**
 * Serves (and accepts uploads for) host files over HTTP, inside the allow-list.
 *
 * ```
 * GET|HEAD|PUT /api/fs/{workspace-relative path...}
 * GET|HEAD|PUT /api/fs//{absolute path...}
 * ```
 *
 * Always requires authentication: HTTP Basic, or the web host's sign-in session
 * cookie (the one `/api/auth/session` issues), so media tags and downloads ride
 * on the same sign-in as the RPC socket and stop working at sign-out.
 * Optional `?download=1` sets Content-Disposition: attachment.
 * Local files stream via Bun.file when an absolute path is available.
 */
export default class FileSystemHttpResource implements WebResource {
  routes: NonNullable<WebResource["routes"]> = {};

  constructor(
    private readonly app: TokenRingApp,
    options: FileSystemHttpResourceOptions = {},
  ) {
    const prefix = (options.prefix ?? DEFAULT_PREFIX).replace(/\/+$/, "") || DEFAULT_PREFIX;

    this.routes[`${prefix}/*`] = async (request: Request) => {
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "PUT") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: ALLOWED_METHODS } });
      }

      const refused = this.authenticate(request);
      if (refused) return refused;

      const target = this.parseTarget(request, prefix);
      if (target instanceof Response) return target;

      let { filePath } = target;

      let fileSystemService: FileSystemService;
      try {
        fileSystemService = this.app.requireService(FileSystemService);
        // Relative URLs resolve against the workspace directory. Absolute paths are
        // honored (workspaceFileUrl keeps the leading slash) but must still fall inside
        // the allow-list: an arbitrary host path must not be readable/writable here.
        filePath = await fileSystemService.authorizePath(filePath, request.method === "PUT" ? "write" : "read");
      } catch (error: unknown) {
        if (error instanceof PathNotAllowedError) {
          return new Response("Forbidden", { status: 403 });
        }
        return new Response("Not Found", { status: 404 });
      }

      if (request.method === "PUT") {
        try {
          const body = Buffer.from(await request.arrayBuffer());
          // Uploads go through the system write so they archive like any other write.
          await fileSystemService.writeSystemFile(filePath, body);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Upload failed";
          return new Response(message, { status: 500 });
        }
        return new Response(null, { status: 201 });
      }

      const stats = await fileSystemService.host.stat(filePath);
      if (!stats.exists || !stats.isFile) {
        if (!stats.exists) {
          return new Response("Not Found", { status: 404 });
        }
        if (stats.isDirectory) {
          return new Response("Not Found", { status: 404 });
        }
      }

      const url = new URL(request.url);
      const contentType = guessMimeType(filePath);
      const headers = new Headers({
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });

      // A document type the browser runs (HTML, SVG, XML) gets an opaque origin, so a page an agent
      // wrote cannot act as the signed-in user: no session cookie, no RPC socket. Images, media and
      // PDFs are unaffected.
      if (ACTIVE_DOCUMENT_TYPES.has(contentType.split(";")[0]!.trim().toLowerCase())) {
        headers.set("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-forms allow-modals");
      }

      if (url.searchParams.get("download") === "1") {
        headers.set("Content-Disposition", contentDispositionAttachment(filePath));
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

      const content = await fileSystemService.host.readFile(filePath);
      if (content == null) {
        return new Response("Not Found", { status: 404 });
      }

      headers.set("Content-Length", String(content.byteLength));
      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }
      return new Response(new Uint8Array(content), { status: 200, headers });
    };
  }

  /**
   * Accepts HTTP Basic (rate-limited like every password check) or the web
   * host's sign-in session cookie. Returns a Response to send when refused.
   */
  private authenticate(request: Request): Response | null {
    let webHost: WebHostService | null = null;
    let auth: ParsedWebHostAuthConfig | null = null;
    try {
      webHost = this.app.requireService(WebHostService);
      auth = webHost.getAuthConfig();
    } catch {
      // No web host, or its config is not loaded yet: treated as unconfigured below.
    }
    if (!webHost || !auth || Object.keys(auth.users).length === 0) {
      // Misconfiguration: refuse rather than open the tree.
      return new Response("Authentication is not configured", { status: 503 });
    }

    const basic = parseBasicCredentials(request.headers.get("Authorization"));
    if (basic) {
      const throttleKey = LoginRateLimiter.keyFor(LoginRateLimiter.clientIpFromRequest(request), basic.username);
      const retryAfterSeconds = loginRateLimiter.isBlocked(throttleKey);
      if (retryAfterSeconds > 0) {
        return new Response("Too many failed login attempts", {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" },
        });
      }
      if (credentialsValid(auth, basic.username, basic.password)) {
        loginRateLimiter.recordSuccess(throttleKey);
        return null;
      }
      loginRateLimiter.recordFailure(throttleKey);
      return unauthorizedResponse();
    }

    if (webHost.resolveSessionUsername(request) !== null) return null;
    return unauthorizedResponse();
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

    // `/api/fs/rel/path` is workspace-relative; `/api/fs//abs/path` keeps its leading slash.
    let filePath = pathname.slice(prefix.length).replace(/^\//, "");
    if (!filePath) {
      return new Response("Not Found", { status: 404 });
    }

    filePath = path.posix.normalize(filePath);
    if (filePath === ".." || filePath.startsWith("../") || filePath.includes("/../")) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!filePath || filePath === ".") {
      return new Response("Not Found", { status: 404 });
    }

    return { filePath };
  }
}

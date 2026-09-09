import path from "node:path";
import type { AllowedPath } from "../schema.ts";

export type PathAccess = "read" | "write";

export class PathNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathNotAllowedError";
  }
}

export interface AuthorizeOptions {
  /** Workspace allow-list entries (raw config; provider defaults applied here). */
  entries: AllowedPath[];
  /** Provider the path being authorized belongs to. */
  provider: string;
  /** Provider that entries without an explicit provider field apply to. */
  defaultProvider: string;
  /** Implicitly write-allowed subtree for the default provider (workspace data directory). */
  workspaceDirectory?: string | undefined;
  /** Symlink resolver (posix only). When set, the resolved path is re-checked for containment. */
  realpath?: ((p: string) => Promise<string>) | undefined;
}

/** Normalize an entry/target path: resolve and strip trailing separators (except root). */
export function normalizeAllowedPath(p: string): string {
  return path.resolve(p);
}

/** True when target equals root or sits inside it (`/foo` does not contain `/foobar`). */
export function pathIsWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Entries applying to `provider`, normalized, with the implicit workspace entry
 * appended for the default provider. Order preserves the configured list.
 */
export function allowedPathsForProvider(opts: Omit<AuthorizeOptions, "realpath">): AllowedPath[] {
  const list: AllowedPath[] = opts.entries
    .filter(entry => (entry.provider ?? opts.defaultProvider) === opts.provider)
    .map(entry => ({ ...entry, path: normalizeAllowedPath(entry.path) }));

  if (opts.workspaceDirectory && opts.provider === opts.defaultProvider) {
    const workspacePath = normalizeAllowedPath(opts.workspaceDirectory);
    if (!list.some(entry => entry.path === workspacePath)) {
      list.push({ path: workspacePath, permission: "write", description: "Workspace data directory" });
    }
  }

  return list;
}

/**
 * Entries that are not contained inside another entry — the set of roots to
 * walk when searching everything, without double-listing nested entries.
 */
export function topLevelRoots(entries: AllowedPath[]): AllowedPath[] {
  return entries.filter(entry => !entries.some(other => other !== entry && other.path !== entry.path && pathIsWithin(other.path, entry.path)));
}

/** Most-specific entry containing target (longest matching root wins), or null. */
export function findAllowedRoot(target: string, entries: AllowedPath[]): AllowedPath | null {
  let best: AllowedPath | null = null;
  for (const entry of entries) {
    if (pathIsWithin(entry.path, target) && (!best || entry.path.length > best.path.length)) {
      best = entry;
    }
  }
  return best;
}

function describeEntries(entries: AllowedPath[]): string {
  if (entries.length === 0) return "(no directories are currently allowed)";
  return entries.map(entry => `- ${entry.path} (${entry.permission})${entry.description ? ` — ${entry.description}` : ""}`).join("\n");
}

/**
 * Resolve a symlinked path by realpath-ing the longest existing ancestor and
 * re-joining the non-existent suffix. Falls back to the input when nothing exists.
 */
async function resolveRealPath(target: string, realpath: (p: string) => Promise<string>): Promise<string> {
  let current = target;
  const suffix: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      return suffix.length > 0 ? path.join(real, ...suffix) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Authorize an absolute path against the allow-list. Returns the normalized
 * path on success; throws PathNotAllowedError (with the allowed roots in the
 * message) when the path is relative, outside every allowed root, or requires
 * write access inside a read-only root. Write implies read.
 */
export async function authorizePath(target: string, access: PathAccess, opts: AuthorizeOptions): Promise<string> {
  const entries = allowedPathsForProvider(opts);

  if (!path.isAbsolute(target)) {
    throw new PathNotAllowedError(
      `Path "${target}" is not absolute. Filesystem paths must be absolute paths inside an allowed directory:\n${describeEntries(entries)}`,
    );
  }

  const normalized = normalizeAllowedPath(target);

  const check = (candidate: string): void => {
    const root = findAllowedRoot(candidate, entries);
    if (!root) {
      throw new PathNotAllowedError(`Path "${target}" is outside the allowed directories:\n${describeEntries(entries)}`);
    }
    if (access === "write" && root.permission !== "write") {
      throw new PathNotAllowedError(
        `Path "${target}" is inside read-only directory ${root.path}. Writable directories:\n${describeEntries(entries.filter(e => e.permission === "write"))}`,
      );
    }
  };

  check(normalized);

  if (opts.realpath) {
    const real = await resolveRealPath(normalized, opts.realpath);
    if (real !== normalized) check(real);
  }

  return normalized;
}

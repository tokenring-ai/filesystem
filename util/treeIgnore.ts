import path from "node:path";
import type { MaybePromise } from "bun";
import ignore from "ignore";

type Ignore = ReturnType<typeof ignore>;

export type WalkIgnoreOptions = {
  /** Yield paths whose basename starts with `.` (default false). `.git` is always pruned. */
  includeHidden?: boolean | undefined;
  /** Honor nested `.gitignore` files as the tree is walked (default true). */
  gitignore?: boolean | undefined;
  /** Honor nested `.aiignore` files as the tree is walked (default true). */
  aiignore?: boolean | undefined;
};

export type TreeIgnoreIO = {
  readFile(path: string): MaybePromise<Buffer | null>;
  exists(path: string): MaybePromise<boolean>;
};

/**
 * Walk-scoped ignore state. Constructed per walk (glob/grep/tree call) and
 * consulted as directories are entered; nested `.gitignore`/`.aiignore` files
 * are loaded lazily and cached only for the lifetime of this instance, so the
 * next walk sees edits and new submodule checkouts.
 */
export class TreeIgnore {
  private readonly root: string;
  private readonly includeHidden: boolean;
  private readonly gitignore: boolean;
  private readonly aiignore: boolean;
  private readonly ignoreFileCache = new Map<string, Promise<Ignore | null>>();

  constructor(
    root: string,
    options: WalkIgnoreOptions,
    private readonly io: TreeIgnoreIO,
  ) {
    this.root = path.resolve(root);
    this.includeHidden = options.includeHidden ?? false;
    this.gitignore = options.gitignore ?? true;
    this.aiignore = options.aiignore ?? true;
  }

  /** true → skip this path; if it is a directory, do not descend. */
  shouldIgnore = async (absolutePath: string, isDirectory?: boolean): Promise<boolean> => {
    const hasTrailingSeparator = absolutePath.endsWith("/") || absolutePath.endsWith(path.sep);
    const normalized = path.resolve(absolutePath);
    const isDir = isDirectory ?? hasTrailingSeparator;
    const basename = path.basename(normalized);

    // Never walk .git objects, even with includeHidden.
    if (basename === ".git") return true;
    if (!this.includeHidden && basename.startsWith(".") && normalized !== this.root) return true;

    const relative = path.relative(this.root, normalized);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return false;

    if (this.gitignore && (await this.matchesCascade(relative, isDir, ".gitignore"))) return true;
    if (this.aiignore && (await this.matchesCascade(relative, isDir, ".aiignore"))) return true;
    return false;
  };

  /**
   * Apply each ancestor directory's ignore file (walk root down to the parent),
   * matching the path relative to that ignore file's own directory so nested
   * files and submodule roots behave like git.
   */
  private async matchesCascade(relativePath: string, isDir: boolean, fileName: string): Promise<boolean> {
    const segments = relativePath.split(path.sep);
    let dir = this.root;
    for (let i = 0; i < segments.length; i++) {
      const ig = await this.loadIgnoreFile(path.join(dir, fileName));
      if (ig) {
        const relativeToDir = segments.slice(i).join("/");
        if (ig.ignores(isDir ? `${relativeToDir}/` : relativeToDir)) return true;
      }
      dir = path.join(dir, segments[i]!);
    }
    return false;
  }

  private loadIgnoreFile(filePath: string): Promise<Ignore | null> {
    let cached = this.ignoreFileCache.get(filePath);
    if (!cached) {
      cached = (async () => {
        try {
          const data = await this.io.readFile(filePath);
          if (!data) return null;
          const lines = data.toString("utf-8").split(/\r?\n/).filter(Boolean);
          if (lines.length === 0) return null;
          return ignore().add(lines);
        } catch {
          return null;
        }
      })();
      this.ignoreFileCache.set(filePath, cached);
    }
    return cached;
  }
}

/**
 * Event-time ignore for watchers: rebuilds its TreeIgnore after a TTL (or an
 * explicit invalidate when an ignore file itself changes), so editing
 * `.gitignore` while the app runs takes effect on subsequent events.
 */
export class RefreshingTreeIgnore {
  private current: TreeIgnore | null = null;
  private builtAt = 0;

  constructor(
    private readonly root: string,
    private readonly options: WalkIgnoreOptions,
    private readonly io: TreeIgnoreIO,
    private readonly ttlMs = 5000,
  ) {}

  invalidate(): void {
    this.current = null;
  }

  shouldIgnore = (absolutePath: string, isDirectory?: boolean): Promise<boolean> => {
    if (!this.current || Date.now() - this.builtAt > this.ttlMs) {
      this.current = new TreeIgnore(this.root, this.options, this.io);
      this.builtAt = Date.now();
    }
    return this.current.shouldIgnore(absolutePath, isDirectory);
  };
}

/** True when the path names an ignore file whose edit should invalidate event-time caches. */
export function isIgnoreFile(absolutePath: string): boolean {
  const basename = path.basename(absolutePath);
  return basename === ".gitignore" || basename === ".aiignore";
}

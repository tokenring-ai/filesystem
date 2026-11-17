import type { MaybePromise } from "bun";

export type StatLike =
  | {
      path: string;
      absolutePath?: string;
      exists: true;
      isFile?: boolean;
      isDirectory?: boolean;
      isSymbolicLink?: boolean;
      size?: number;
      created?: Date;
      modified?: Date;
      accessed?: Date;
    }
  | {
      path: string;
      exists: false;
    };

export interface GrepResult {
  file: string;
  line: number;
  match: string;
  matchedString?: string | undefined;
  content: string | null;
}

/**
 * Walk-time ignore predicate. May be async (it can read nested ignore files as
 * the walk proceeds); providers must await it and prune when it returns true.
 */
export type IgnorePredicate = (path: string, isDirectory?: boolean) => MaybePromise<boolean>;

export interface DirectoryTreeOptions {
  ignoreFilter: IgnorePredicate;
  recursive?: boolean | undefined;
}

export interface GlobOptions {
  ignoreFilter: IgnorePredicate;
  includeDirectories?: boolean | undefined;
}

export interface WatchOptions {
  ignoreFilter: IgnorePredicate;
  pollInterval?: number | undefined;
  stabilityThreshold?: number | undefined;
}

export interface FileSystemWatcher {
  on(event: "add" | "change" | "unlink", listener: (filePath: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  close(): void;
}

export interface GrepOptions {
  ignoreFilter: IgnorePredicate;
  includeContent?: { linesBefore?: number | undefined; linesAfter?: number | undefined };
  /** Absolute directory to walk. Required — there is no implicit default. */
  cwd: string;
  /** Stop after this many matching lines. Providers that cannot stop early may ignore it; callers still truncate. */
  maxResults?: number | undefined;
  /** Match case-insensitively (default false). */
  ignoreCase?: boolean | undefined;
}

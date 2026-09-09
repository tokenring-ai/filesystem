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
}

/**
 * FileSystemProvider is an interface that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export interface FileSystemProvider {
  // Directory walking
  getDirectoryTree(absolutePath: string, params?: DirectoryTreeOptions): AsyncGenerator<string> | Generator<string>;

  // file ops
  writeFile(absolutePath: string, content: string | Buffer): MaybePromise<boolean>;

  appendFile(absoluteFilePath: string, finalContent: string | Buffer): MaybePromise<boolean>;

  deleteFile(absolutePath: string): MaybePromise<boolean>;

  readFile(absolutePath: string): MaybePromise<Buffer | null>;

  rename(oldAbsolutePath: string, newAbsolutePath: string): MaybePromise<boolean>;

  exists(absolutePath: string): MaybePromise<boolean>;

  stat(absolutePath: string): MaybePromise<StatLike>;

  createDirectory(absolutePath: string, options?: { recursive?: boolean | undefined }): MaybePromise<boolean>;

  copy(absoluteSource: string, absoluteDestination: string, options?: { overwrite?: boolean | undefined }): MaybePromise<boolean>;

  glob?(absolutePattern: string, options?: GlobOptions): MaybePromise<string[]>;

  /**
   * Resolve symlinks in an absolute path (posix providers). Used by allow-list
   * authorization to prevent symlink escapes; throws when the path does not exist.
   */
  realpath?(absolutePath: string): Promise<string>;

  watch?(absoluteDir: string, options?: WatchOptions): MaybePromise<FileSystemWatcher>;

  grep?(searchString: string | string[], options?: GrepOptions): MaybePromise<GrepResult[]>;
}

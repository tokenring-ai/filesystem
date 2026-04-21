import type { MaybePromise } from "bun";

export type StatLike =
  | {
      path: string;
      absolutePath?: string | undefined;
      exists: true;
      isFile: boolean;
      isDirectory: boolean;
      isSymbolicLink?: boolean | undefined;
      size?: number | undefined;
      created?: Date | undefined;
      modified?: Date | undefined;
      accessed?: Date | undefined;
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

export interface DirectoryTreeOptions {
  ignoreFilter: (path: string) => boolean;
  recursive?: boolean | undefined;
}

export interface GlobOptions {
  ignoreFilter: (path: string) => boolean;
  absolute?: boolean | undefined;
  includeDirectories?: boolean | undefined;
}

export interface WatchOptions {
  ignoreFilter: (path: string) => boolean;
  pollInterval?: number | undefined;
  stabilityThreshold?: number | undefined;
}

export interface GrepOptions {
  ignoreFilter: (path: string) => boolean;
  includeContent?: { linesBefore?: number | undefined; linesAfter?: number | undefined };
  cwd?: string | undefined;
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

  watch?(absoluteDir: string, options?: WatchOptions): MaybePromise<any>;

  grep?(searchString: string | string[], options?: GrepOptions): MaybePromise<GrepResult[]>;
}

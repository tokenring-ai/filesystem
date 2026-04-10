import type {MaybePromise} from "bun";

export type StatLike =
  | {
  path: string;
  absolutePath?: string;
  exists: true;
  isFile: boolean;
  isDirectory: boolean;
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
  matchedString?: string;
  content: string | null;
}

export interface DirectoryTreeOptions {
  ignoreFilter: (path: string) => boolean;
  recursive?: boolean;
}

export interface GlobOptions {
  ignoreFilter: (path: string) => boolean;
  absolute?: boolean;
  includeDirectories?: boolean;
}

export interface WatchOptions {
  ignoreFilter: (path: string) => boolean;
  pollInterval?: number;
  stabilityThreshold?: number;
}

export interface GrepOptions {
  ignoreFilter: (path: string) => boolean;
  includeContent?: { linesBefore?: number; linesAfter?: number };
  cwd?: string;
}

/**
 * FileSystemProvider is an interface that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export interface FileSystemProvider {
  // Directory walking
  getDirectoryTree(
    absolutePath: string,
    params?: DirectoryTreeOptions,
  ): AsyncGenerator<string> | Generator<string>;

  // file ops
  writeFile(absolutePath: string, content: string | Buffer): MaybePromise<boolean>;

  appendFile(
    absoluteFilePath: string,
    finalContent: string | Buffer,
  ): MaybePromise<boolean>;

  deleteFile(absolutePath: string): MaybePromise<boolean>;

  readFile(absolutePath: string): MaybePromise<Buffer | null>;

  rename(oldAbsolutePath: string, newAbsolutePath: string): MaybePromise<boolean>;

  exists(absolutePath: string): MaybePromise<boolean>;

  stat(absolutePath: string): MaybePromise<StatLike>;

  createDirectory(
    absolutePath: string,
    options?: { recursive?: boolean },
  ): MaybePromise<boolean>;

  copy(
    absoluteSource: string,
    absoluteDestination: string,
    options?: { overwrite?: boolean },
  ): MaybePromise<boolean>;

  glob?(absolutePattern: string, options?: GlobOptions): MaybePromise<string[]>;

  watch?(absoluteDir: string, options?: WatchOptions): MaybePromise<any>;

  grep?(
    searchString: string | string[],
    options?: GrepOptions,
  ): MaybePromise<GrepResult[]>;
}

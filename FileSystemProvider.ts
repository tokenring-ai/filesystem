export type StatLike = {
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
} | {
  path: string;
  exists: false;
}

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
export default interface FileSystemProvider {
  // Directory walking
  getDirectoryTree(
    absolutePath: string,
    params?: DirectoryTreeOptions,
  ): AsyncGenerator<string>;

  // file ops
  writeFile(absolutePath: string, content: string | Buffer): Promise<boolean>;

  appendFile(absoluteFilePath: string, finalContent: string | Buffer): Promise<boolean>;

  deleteFile(absolutePath: string): Promise<boolean>;

  readFile(absolutePath: string): Promise<Buffer|null>;

  rename(oldAbsolutePath: string, newAbsolutePath: string): Promise<boolean>;

  exists(absolutePath: string): Promise<boolean>;

  stat(absolutePath: string): Promise<StatLike>;

  createDirectory(
    absolutePath: string,
    options?: { recursive?: boolean },
  ): Promise<boolean>;

  copy(
    absoluteSource: string,
    absoluteDestination: string,
    options?: { overwrite?: boolean },
  ): Promise<boolean>;

  glob(absolutePattern: string, options?: GlobOptions): Promise<string[]>;

  watch(absoluteDir: string, options?: WatchOptions): Promise<any>;

  grep(
    searchString: string | string[],
    options?: GrepOptions,
  ): Promise<GrepResult[]>;
}

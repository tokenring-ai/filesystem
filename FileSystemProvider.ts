export interface StatLike {
  path: string;
  absolutePath?: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink?: boolean;
  size?: number;
  created?: Date;
  modified?: Date;
  accessed?: Date;
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
}

export interface WatchOptions {
  ignoreFilter: (path: string) => boolean;
  pollInterval?: number;
  stabilityThreshold?: number;
}

export interface ExecuteCommandOptions {
  timeoutSeconds?: number;
  env?: Record<string, string | undefined>;
  workingDirectory?: string;
}

export interface ExecuteCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export interface GrepOptions {
  ignoreFilter: (path: string) => boolean;
  includeContent?: { linesBefore?: number; linesAfter?: number };
}


/**
 * FileSystemProvider is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default abstract class FileSystemProvider {
  // Base directory getter for implementations that are rooted (e.g., local FS)
  abstract getBaseDirectory(): string;

  // Path helpers for implementations that map relative/absolute paths
  abstract relativeOrAbsolutePathToAbsolutePath(p: string): string;

  abstract relativeOrAbsolutePathToRelativePath(p: string): string;

  // Directory walking
  abstract getDirectoryTree(path: string, params?: DirectoryTreeOptions): AsyncGenerator<string>;

  // file ops
  abstract writeFile(path: string, content: string | Buffer): Promise<boolean>;

  abstract appendFile(filePath: string, finalContent: string | Buffer): Promise<boolean>;

  abstract deleteFile(path: string): Promise<boolean>;

  abstract readFile(path: string, encoding?: BufferEncoding | "buffer"): Promise<any>;

  async getFile(path: string): Promise<string | null> {
    return await this.readFile(path, "utf8" as BufferEncoding);
  }


  abstract rename(oldPath: string, newPath: string): Promise<boolean>;

  abstract exists(path: string): Promise<boolean>;

  abstract stat(path: string): Promise<StatLike>;

  abstract createDirectory(path: string, options?: { recursive?: boolean }): Promise<boolean>;

  abstract copy(source: string, destination: string, options?: { overwrite?: boolean }): Promise<boolean>;

  abstract chmod(path: string, mode: number): Promise<boolean>;

  abstract glob(pattern: string, options?: GlobOptions): Promise<string[]>;

  abstract watch(dir: string, options?: WatchOptions): Promise<any>;

  abstract executeCommand(command: string | string[], options?: ExecuteCommandOptions): Promise<ExecuteCommandResult>;

  abstract grep(
    searchString: string | string[],
    options?: GrepOptions,
  ): Promise<GrepResult[]>;
}

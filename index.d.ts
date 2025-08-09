export const name: string;
export const description: string;
export const version: string;

export * as chatCommands from "./chatCommands.js";
export * as tools from "./tools.js";

import { Service, Resource, Registry } from "@token-ring/registry";

export class FileSystemService extends Service {
  constructor(options: { defaultSelectedFiles?: string[] });

  name: string;
  description: string;

  protected defaultSelectedFiles: string[];
  protected manuallySelectedFiles: Set<string>;
  protected dirty: boolean;

  // lifecycle
  start(registry: Registry): Promise<void>;
  stop(registry: Registry): Promise<void>;

  // ignore helpers
  protected createIgnoreFilter(): Promise<(path: string) => boolean>;

  // directory walking
  getDirectoryTree(
    path: string,
    params?: { ig?: (path: string) => boolean; recursive?: boolean }
  ): AsyncGenerator<string, any, any>;

  // file ops
  writeFile(path: string, content: string): Promise<boolean>;
  deleteFile(path: string): Promise<boolean>;
  readFile(path: string, encoding?: BufferEncoding | "buffer"): Promise<any>;
  getFile(path: string, encoding?: BufferEncoding | "buffer"): Promise<any>;
  rename(oldPath: string, newPath: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{
    path: string;
    absolutePath?: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink?: boolean;
    size?: number;
    created?: Date;
    modified?: Date;
    accessed?: Date;
  }>;
  createDirectory(
    path: string,
    options?: { recursive?: boolean }
  ): Promise<boolean>;
  copy(
    source: string,
    destination: string,
    options?: { overwrite?: boolean }
  ): Promise<boolean>;
  chmod(path: string, mode: number): Promise<boolean>;
  chown(path: string, uid: number, gid: number): Promise<boolean>;

  // glob + watch
  glob(
    pattern: string,
    options?: { ig?: (path: string) => boolean }
  ): Promise<string[]>;
  watch(
    dir: string,
    options?: {
      ig?: (path: string) => boolean;
      pollInterval?: number;
      stabilityThreshold?: number;
    }
  ): Promise<any>; // FSWatcher

  // execution + grep
  executeCommand(
    command: string | string[],
    options?: {
      timeoutSeconds?: number;
      env?: Record<string, string>;
      workingDirectory?: string;
    }
  ): Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string | null;
  }>;
  grep(
    searchString: string | string[],
    options?: {
      ignoreFilter?: (path: string) => boolean;
      includeContent?: { linesBefore?: number; linesAfter?: number };
    }
  ): Promise<
    Array<{
      file: string;
      line: number;
      match: string;
      matchedString?: string;
      content: string | null;
    }>
  >;

  // dirty flag
  setDirty(dirty: boolean): void;
  getDirty(): boolean;

  // chat file selection
  addFileToChat(file: string): Promise<void>;
  removeFileFromChat(file: string): void;
  getFilesInChat(): Set<string>;
  setFilesInChat(files: Iterable<string>): void;
  getDefaultFiles(): string[];

  // memories
  getMemories(registry: Registry): AsyncGenerator<
    { role: "system" | "user" | string; content: string },
    any,
    any
  >;
}

export class FileMatchResource extends Resource {
  constructor(params: {
    items: Array<{
      path: string;
      include?: RegExp;
      exclude?: RegExp;
    }>;
  });

  getMatchedFiles(registry: Registry): AsyncGenerator<string, any, any>;
  addFilesToSet(set: Set<string>, registry: Registry): Promise<void>;
}

import ChatService from "@token-ring/chat/ChatService";
import {type Registry, Service} from "@token-ring/registry";
import ignore from "ignore";

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

export interface DirectoryTreeOptions {
  ig?: (path: string) => boolean;
  recursive?: boolean;
}

export interface GlobOptions {
  ig?: (path: string) => boolean;
  absolute?: boolean;
}

export interface WatchOptions {
  ig?: (path: string) => boolean;
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
  error?: string | null;
}

export interface GrepOptions {
  ignoreFilter?: (path: string) => boolean;
  includeContent?: { linesBefore?: number; linesAfter?: number };
}

export interface MemoryItem {
  role: "system" | "user" | string;
  content: string;
}

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService extends Service {
  name = "FileSystem";
  description = "Abstract interface for virtual file system operations";

  protected defaultSelectedFiles: string[];
  protected manuallySelectedFiles: Set<string>;
  protected dirty = false;
  protected registry!: Registry;

  /**
   * Creates an instance of FileSystem
   */
  constructor({ defaultSelectedFiles = [] as string[] }: { defaultSelectedFiles?: string[] } = {}) {
    super();
    this.defaultSelectedFiles = defaultSelectedFiles;
    this.manuallySelectedFiles = new Set(defaultSelectedFiles);
  }

  /**
   * Create an ignore filter for files
   * @returns A filter function that returns true for files to ignore
   * @private
   */
  async createIgnoreFilter(): Promise<(p: string) => boolean> {
    // Create the base ignore filter
    const ig = ignore();
    ig.add(".git"); // always ignore .git dir at root
    ig.add("*.lock");
    ig.add("node_modules");
    ig.add(".*");

    const gitIgnorePath = ".gitignore";
    if (await this.exists(gitIgnorePath)) {
      const data = await this.getFile(gitIgnorePath);
      const lines = data.split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }

    const aiIgnorePath = ".aiignore";
    if (await this.exists(aiIgnorePath)) {
      const data = await this.getFile(aiIgnorePath);
      const lines = data.split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }

    return ig.ignores.bind(ig);
  }

  /** Starts the service by registering commands. */
  async start(registry: Registry): Promise<void> {
    const chatContext = registry.requireFirstServiceByType(ChatService);
    this.registry = registry;
    chatContext.on("clear", this.clearFilesFromChat.bind(this));
  }

  /** Stops the service by unregistering commands. */
  async stop(registry: Registry): Promise<void> {
    const chatContext = registry.requireFirstServiceByType(ChatService);
    chatContext.off("clear", this.clearFilesFromChat.bind(this));
  }

  // ABSTRACT INTERFACE
  // Directory walking
  // eslint-disable-next-line require-yield
  async *getDirectoryTree(_path: string, _params?: DirectoryTreeOptions): AsyncGenerator<string> {
    throw new Error("Method 'getDirectoryTree' must be implemented by subclasses");
  }

  // file ops
  async writeFile(_path: string, _content: string | Buffer): Promise<boolean> {
    throw new Error("Method 'writeFile' must be implemented by subclasses");
  }

  async deleteFile(_path: string): Promise<boolean> {
    throw new Error("Method 'deleteFile' must be implemented by subclasses");
  }

  async getFile(path: string): Promise<string> {
    return await this.readFile(path, "utf8" as BufferEncoding) as unknown as string;
  }

  async readFile(_path: string, _encoding?: BufferEncoding | "buffer"): Promise<any> {
    throw new Error("Method 'readFile' must be implemented by subclasses");
  }

  async rename(_oldPath: string, _newPath: string): Promise<boolean> {
    throw new Error("Method 'rename' must be implemented by subclasses");
  }

  async exists(_path: string): Promise<boolean> {
    throw new Error("Method 'exists' must be implemented by subclasses");
  }

  async stat(_path: string): Promise<StatLike> {
    throw new Error("Method 'stat' must be implemented by subclasses");
  }

  async createDirectory(_path: string, _options: { recursive?: boolean } = {}): Promise<boolean> {
    throw new Error("Method 'createDirectory' must be implemented by subclasses");
  }

  async copy(_source: string, _destination: string, _options: { overwrite?: boolean } = {}): Promise<boolean> {
    throw new Error("Method 'copy' must be implemented by subclasses");
  }

  async chmod(_path: string, _mode: number): Promise<boolean> {
    throw new Error("Method 'chmod' must be implemented by subclasses");
  }

  async glob(_pattern: string, _options: GlobOptions = {}): Promise<string[]> {
    throw new Error("Method 'glob' must be implemented by subclasses");
  }

  async watch(_dir: string, _options: WatchOptions = {}): Promise<any> {
    throw new Error("Method 'watch' must be implemented by subclasses");
  }

  async executeCommand(_command: string | string[], _options: ExecuteCommandOptions = {}): Promise<ExecuteCommandResult> {
    throw new Error("Method 'executeCommand' must be implemented by subclasses");
  }

  async grep(
    _searchString: string | string[],
    _options: GrepOptions = {},
  ): Promise<Array<{ file: string; line: number; match: string; matchedString?: string; content: string | null }>> {
    throw new Error("Method 'grep' must be implemented by subclasses");
  }

  // dirty flag
  setDirty(dirty: boolean): void {
    this.dirty = dirty;
  }

  getDirty(): boolean {
    return this.dirty;
  }

  // chat file selection
  async addFileToChat(file: string): Promise<void> {
    if (!(await this.exists(file))) {
      throw new Error(`Could not find file to add to chat: ${file}`);
    }
    this.manuallySelectedFiles.add(file);
  }

  removeFileFromChat(file: string): void {
    if (this.manuallySelectedFiles.has(file)) {
      this.manuallySelectedFiles.delete(file);
    } else {
      throw new Error(
        `File ${file} was not found in the chat context and could not be removed.`,
      );
    }
  }

  /**
   * Clears file references from the chat when the chat is cleared
   * This is a callback for the 'clear' event on ChatService.
   * @private
   */
  clearFilesFromChat(type: string): void {
    if (type === 'chat') {
        this.manuallySelectedFiles.clear();
        const chatService = this.registry.getFirstServiceByType(ChatService);
        if (chatService) {
            chatService.systemLine("[FileSystemService] Clearing file references");
        }
    }
  }

  getFilesInChat(): Set<string> {
    return this.manuallySelectedFiles;
  }

  setFilesInChat(files: Iterable<string>): void {
    this.manuallySelectedFiles.clear();
    for (const file of files) {
      this.manuallySelectedFiles.add(file);
    }
  }

  getDefaultFiles(): string[] {
    return this.defaultSelectedFiles;
  }

  /**
   * Asynchronously yields memories from manually selected files.
   */
  async *getMemories(_registry: Registry): AsyncGenerator<MemoryItem> {
    for (const file of this.manuallySelectedFiles) {
      const content = await this.getFile(file);
      yield {
        role: "user",
        content: `// ${file}\n${content}`,
      };
    }
  }
}

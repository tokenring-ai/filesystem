import ChatService from "@token-ring/chat/ChatService";
import {type Registry, Service} from "@token-ring/registry";
import {MemoryItemMessage} from "@token-ring/registry/Service";
import GenericSingularRegistry from "@token-ring/utility/GenericSingularRegistry";
import ignore from "ignore";
import FileSystemProvider, {
  DirectoryTreeOptions,
  ExecuteCommandOptions, ExecuteCommandResult,
  GlobOptions, GrepOptions, GrepResult,
  StatLike,
  WatchOptions
} from "./FileSystemProvider.js";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService extends Service {
  name = "FileSystem";
  description = "Abstract interface for virtual file system operations";
  dirty = false;

  protected defaultSelectedFiles: string[];
  protected manuallySelectedFiles: Set<string>;
  protected registry!: Registry;

  private fileSystemProviderRegistry = new GenericSingularRegistry<FileSystemProvider>();

  registerFileSystemProvider = this.fileSystemProviderRegistry.register;
  getActiveFileSystemProviderName = this.fileSystemProviderRegistry.getActiveItemName;
  setActiveFileSystemProviderName = this.fileSystemProviderRegistry.setEnabledItem;
  getAvailableFileSystemProviders = this.fileSystemProviderRegistry.getAllItemNames;


  /**
   * Creates an instance of FileSystem
   */
  constructor({defaultSelectedFiles = [] as string[]}: { defaultSelectedFiles?: string[] } = {}) {
    super();
    this.defaultSelectedFiles = defaultSelectedFiles;
    this.manuallySelectedFiles = new Set(defaultSelectedFiles);
  }


  // Base directory getter for implementations that are rooted (e.g., local FS)
  getBaseDirectory(): string {
    return this.fileSystemProviderRegistry.getActiveItem().getBaseDirectory();
  }

  // Path helpers for implementations that map relative/absolute paths
  relativeOrAbsolutePathToAbsolutePath(p: string): string {
    return this.fileSystemProviderRegistry.getActiveItem().relativeOrAbsolutePathToAbsolutePath(p);
  }

  relativeOrAbsolutePathToRelativePath(p: string): string {
    return this.fileSystemProviderRegistry.getActiveItem().relativeOrAbsolutePathToRelativePath(p);
  }

  /**
   * Create an ignore filter for files
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
      if (data) {
        const lines = data.split(/\r?\n/).filter(Boolean);
        ig.add(lines);
      }
    }

    const aiIgnorePath = ".aiignore";
    if (await this.exists(aiIgnorePath)) {
      const data = await this.getFile(aiIgnorePath);
      if (data) {
        const lines = data.split(/\r?\n/).filter(Boolean);
        ig.add(lines);
      }
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


  // Directory walking
  async* getDirectoryTree(path: string, params: Optional<DirectoryTreeOptions,"ignoreFilter"> = {}): AsyncGenerator<string> {
    params.ignoreFilter ??= await this.createIgnoreFilter();
    yield* this.fileSystemProviderRegistry.getActiveItem().getDirectoryTree(path, params as DirectoryTreeOptions);
  }

  // file ops
  async writeFile(path: string, content: string | Buffer): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().writeFile(path, content);
  }

  async appendFile(filePath: string, finalContent: string | Buffer): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().appendFile(filePath, finalContent);
  }

  async deleteFile(path: string): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().deleteFile(path);
  }
  async getFile(path: string): Promise<string | null> {
    return this.fileSystemProviderRegistry.getActiveItem().getFile(path);
  }

  async readFile(path: string, encoding?: BufferEncoding | "buffer"): Promise<any> {
    return this.fileSystemProviderRegistry.getActiveItem().readFile(path, encoding);
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().rename(oldPath, newPath);
  }

  async exists(path: string): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().exists(path);
  }

  async stat(path: string): Promise<StatLike> {
    return this.fileSystemProviderRegistry.getActiveItem().stat(path);
  }

  async createDirectory(path: string, options: { recursive?: boolean } = {}): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().createDirectory(path, options);
  }

  async copy(source: string, destination: string, options: { overwrite?: boolean } = {}): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().copy(source, destination, options);
  }

  async chmod(path: string, mode: number): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().chmod(path, mode);
  }

  async glob(pattern: string, options: Optional<GlobOptions,"ignoreFilter"> = {}): Promise<string[]> {
    options.ignoreFilter = options.ignoreFilter ?? (await this.createIgnoreFilter());
    return this.fileSystemProviderRegistry.getActiveItem().glob(pattern, options as GlobOptions);
  }

  async watch(dir: string, options: Optional<WatchOptions,"ignoreFilter"> = {}): Promise<any> {
    options.ignoreFilter ??= await this.createIgnoreFilter();
    return this.fileSystemProviderRegistry.getActiveItem().watch(dir, options as WatchOptions);
  }

  async executeCommand(command: string | string[], options: ExecuteCommandOptions = {}): Promise<ExecuteCommandResult> {
    return this.fileSystemProviderRegistry.getActiveItem().executeCommand(command, options);
  }

  async grep(
    searchString: string | string[],
    options: Optional<GrepOptions,"ignoreFilter"> = {},
  ): Promise<GrepResult[]> {
    options.ignoreFilter ??= await this.createIgnoreFilter();
    return this.fileSystemProviderRegistry.getActiveItem().grep(searchString, options as GrepOptions);
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
  async* getMemories(_registry: Registry): AsyncGenerator<MemoryItemMessage> {
    for (const file of this.manuallySelectedFiles) {
      const content = await this.getFile(file);
      yield {
        role: "user",
        content: `// ${file}\n${content}`,
      };
    }
  }
}

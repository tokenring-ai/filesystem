import Agent from "@tokenring-ai/agent/Agent";
import {TreeLeaf} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistryWithSingleSelection from "@tokenring-ai/utility/registry/KeyedRegistryWithSingleSelection";
import ignore from "ignore";
import {z} from "zod";
import FileSystemProvider, {
  type DirectoryTreeOptions,
  type ExecuteCommandOptions,
  type ExecuteCommandResult,
  type GlobOptions,
  type GrepOptions,
  type GrepResult,
  type StatLike,
  type WatchOptions
} from "./FileSystemProvider.js";
import {FileSystemConfigSchema} from "./index.ts";
import {FileSystemState} from "./state/fileSystemState.js";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService implements TokenRingService {
  name = "FileSystemService";
  description = "Abstract interface for virtual file system operations";
  dirty = false;


  protected defaultSelectedFiles: string[];
  protected dangerousCommands: string[];
  protected safeCommands: string[];

  private fileSystemProviderRegistry =
    new KeyedRegistryWithSingleSelection<FileSystemProvider>();

  registerFileSystemProvider = this.fileSystemProviderRegistry.register;
  getActiveFileSystemProviderName =
    this.fileSystemProviderRegistry.getActiveItemName;
  setActiveFileSystemProviderName =
    this.fileSystemProviderRegistry.setEnabledItem;
  getAvailableFileSystemProviders =
    this.fileSystemProviderRegistry.getAllItemNames;

  /**
   * Creates an instance of FileSystem
   */
  constructor({
                defaultSelectedFiles,
                dangerousCommands,
                safeCommands
              }: z.infer<typeof FileSystemConfigSchema>) {
    this.defaultSelectedFiles = defaultSelectedFiles ?? [];
    this.dangerousCommands = dangerousCommands;
    this.safeCommands = safeCommands;
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

  async attach(agent: Agent): Promise<void> {
    agent.initializeState(FileSystemState, {
      selectedFiles: new Set(this.defaultSelectedFiles),
    });
  }

  // Directory walking
  async* getDirectoryTree(
    path: string,
    params: Optional<DirectoryTreeOptions, "ignoreFilter"> = {},
  ): AsyncGenerator<string> {
    params.ignoreFilter ??= await this.createIgnoreFilter();
    yield* this.fileSystemProviderRegistry
      .getActiveItem()
      .getDirectoryTree(path, params as DirectoryTreeOptions);
  }

  // file ops
  async writeFile(path: string, content: string | Buffer): Promise<boolean> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .writeFile(path, content);
  }

  async appendFile(
    filePath: string,
    finalContent: string | Buffer,
  ): Promise<boolean> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .appendFile(filePath, finalContent);
  }

  async deleteFile(path: string): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().deleteFile(path);
  }

  async getFile(path: string): Promise<string | null> {
    return await this.readFile(path, "utf8" as BufferEncoding);
  }

  async readFile(
    path: string,
    encoding?: BufferEncoding | "buffer",
  ): Promise<string> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .readFile(path, encoding);
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .rename(oldPath, newPath);
  }

  async exists(path: string): Promise<boolean> {
    return this.fileSystemProviderRegistry.getActiveItem().exists(path);
  }

  async stat(path: string): Promise<StatLike> {
    return this.fileSystemProviderRegistry.getActiveItem().stat(path);
  }

  async createDirectory(
    path: string,
    options: { recursive?: boolean } = {},
  ): Promise<boolean> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .createDirectory(path, options);
  }

  async copy(
    source: string,
    destination: string,
    options: { overwrite?: boolean } = {},
  ): Promise<boolean> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .copy(source, destination, options);
  }

  async glob(
    pattern: string,
    options: Optional<GlobOptions, "ignoreFilter"> = {},
  ): Promise<string[]> {
    options.ignoreFilter =
      options.ignoreFilter ?? (await this.createIgnoreFilter());
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .glob(pattern, options as GlobOptions);
  }

  async watch(
    dir: string,
    options: Optional<WatchOptions, "ignoreFilter"> = {},
  ): Promise<any> {
    options.ignoreFilter ??= await this.createIgnoreFilter();
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .watch(dir, options as WatchOptions);
  }

  async executeCommand(
    command: string | string[],
    options?: Partial<ExecuteCommandOptions>,
  ): Promise<ExecuteCommandResult> {
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .executeCommand(command, { timeoutSeconds: 120, ...options});
  }

  getCommandSafetyLevel(shellString: string): "safe" | "unknown" | "dangerous" {
    let safe = true;
    const commands = this.parseCompoundCommand(shellString);
    for (let command of commands) {
      command = command.trim();
      if (this.dangerousCommands.some((pattern) => command.includes(pattern))) {
        return "dangerous";
      }
      if (!this.safeCommands.some((pattern) => command.startsWith(pattern))) {
        safe = false;
      }
    }
    return safe ? "safe" : "unknown";
  }

  /**
   * Parse compound commands to extract individual commands
   * Handles cases like: "cd frontend/chat && bun add lucide-react"
   * Returns: ["cd", "bun"]
   */
  parseCompoundCommand(command: string): string[] {
    // Split by common command separators
    const separators = ["&&", "||", ";", "|", ">", ">>"];
    let commands = [command];

    // Split by each separator
    for (const sep of separators) {
      const newCommands: string[] = [];
      for (const cmd of commands) {
        newCommands.push(...cmd.split(sep));
      }
      commands = newCommands;
    }

    // Extract command names (first word of each command)
    return commands
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0)
      .map(cmd => cmd.split(" ")[0]);
  }

  async grep(
    searchString: string | string[],
    options: Optional<GrepOptions, "ignoreFilter"> = {},
  ): Promise<GrepResult[]> {
    options.ignoreFilter ??= await this.createIgnoreFilter();
    return this.fileSystemProviderRegistry
      .getActiveItem()
      .grep(searchString, options as GrepOptions);
  }

  // dirty flag
  setDirty(dirty: boolean): void {
    this.dirty = dirty;
  }

  getDirty(): boolean {
    return this.dirty;
  }

  // chat file selection
  async addFileToChat(file: string, agent: Agent): Promise<void> {
    if (!(await this.exists(file))) {
      throw new Error(`Could not find file to add to chat: ${file}`);
    }
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.selectedFiles.add(file);
    });
  }

  removeFileFromChat(file: string, agent: Agent): void {
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      if (state.selectedFiles.has(file)) {
        state.selectedFiles.delete(file);
      } else {
        throw new Error(
          `File ${file} was not found in the chat context and could not be removed.`,
        );
      }
    });
  }

  getFilesInChat(agent: Agent): Set<string> {
    return agent.getState(FileSystemState).selectedFiles;
  }

  async setFilesInChat(files: Iterable<string>, agent: Agent): Promise<void> {
    for (const file of files) {
      if (!(await this.exists(file))) {
        throw new Error(`Could not find file to add to chat: ${file}`);
      }
    }
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.selectedFiles = new Set(files);
    });
  }

  getDefaultFiles(): string[] {
    return this.defaultSelectedFiles;
  }

  /**
   * Asks the user to select an item from a tree structure using
   */
  async askForFileSelection(
    options: { initialSelection?: string[] | undefined, allowDirectories?: boolean } = {},
    agent: Agent,
  ): Promise<Array<string> | null> {
    const buildTree = async (path = ""): Promise<Array<TreeLeaf>> => {
      const children: Array<TreeLeaf> = [];

      for await (const itemPath of this.getDirectoryTree(path, {
        recursive: false,
      })) {
        if (itemPath.endsWith("/")) {
          // Directory
          const dirName = itemPath
            .substring(0, itemPath.length - 1)
            .split("/")
            .pop()!;
          children.push({
            name: dirName,
            ...(options.allowDirectories && { value: itemPath}),
            hasChildren: true,
            children: () => buildTree(itemPath),
          });
        } else {
          // File
          const fileName = itemPath.split("/").pop()!;
          children.push({
            name: fileName,
            value: itemPath,
          });
        }
      }

      return children;
    };

    const {initialSelection} = options;

    return await agent.askHuman({
      type: "askForMultipleTreeSelection",
      message: "Select a file or directory:",
      tree: {
        name: "File Selection",
        children: buildTree,
      },
      loop: false,
      ...(initialSelection && {initialSelection}),
    });
  }
}
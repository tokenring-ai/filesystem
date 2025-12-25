import Agent from "@tokenring-ai/agent/Agent";
import {TreeLeaf} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
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
import {FileSystemAgentConfigSchema, FileSystemConfigSchema} from "./index.ts";
import {FileSystemState} from "./state/fileSystemState.js";
import createIgnoreFilter from "./tools/util/createIgnoreFilter.ts";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService implements TokenRingService {
  name = "FileSystemService";
  description = "Abstract interface for virtual file system operations";

  protected dangerousCommands: RegExp[];
  protected defaultProvider!: FileSystemProvider;

  private fileSystemProviderRegistry =
    new KeyedRegistry<FileSystemProvider>();

  registerFileSystemProvider = this.fileSystemProviderRegistry.register;
  requireFileSystemProviderByName = this.fileSystemProviderRegistry.requireItemByName;

  /**
   * Creates an instance of FileSystem
   */
  constructor(private config: z.output<typeof FileSystemConfigSchema>) {
    this.dangerousCommands = config.dangerousCommands.map(command => new RegExp(command, "is"));
  }

  run(): void {
    // Throws an error if the default provider is not registered, since this is most likely a mistake
    this.defaultProvider = this.fileSystemProviderRegistry.requireItemByName(this.config.defaultProvider);
  }


  async attach(agent: Agent): Promise<void> {
    const config = agent.getAgentConfigSlice('filesystem', FileSystemAgentConfigSchema)
    agent.initializeState(FileSystemState, {
      providerName: config.provider ?? this.config.defaultProvider,
      selectedFiles: config.selectedFiles,
      requireReadBeforeWrite: config.requireReadBeforeWrite
    });
  }

  getActiveFileSystem(agent: Agent): FileSystemProvider {
    const { providerName } = agent.getState(FileSystemState);
    return this.fileSystemProviderRegistry.requireItemByName(providerName);
  }

  setActiveFileSystem(providerName: string, agent: Agent): void {
    this.fileSystemProviderRegistry.requireItemByName(providerName);
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.providerName = providerName;
    });
  }

  // Directory walking
  async* getDirectoryTree(
    path: string,
    options: Optional<DirectoryTreeOptions, "ignoreFilter"> = {},
    agent: Agent
  ): AsyncGenerator<string> {
    const activeFileSystem = this.getActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    yield* activeFileSystem.getDirectoryTree(path, options as DirectoryTreeOptions);
  }

  // file ops
  async writeFile(path: string, content: string | Buffer, agent: Agent): Promise<boolean> {
    this.setDirty(true, agent);
    return this.getActiveFileSystem(agent)
      .writeFile(path, content);
  }

  async appendFile(
    filePath: string,
    finalContent: string | Buffer,
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);
    return this.getActiveFileSystem(agent)
      .appendFile(filePath, finalContent);
  }

  async deleteFile(path: string, agent: Agent): Promise<boolean> {
    this.setDirty(true, agent);
    return this.getActiveFileSystem(agent).deleteFile(path);
  }

  async getFile(path: string, agent: Agent): Promise<string | null> {
    return await this.readFile(path, "utf8" as BufferEncoding, agent);
  }

  async readFile(
    path: string,
    encoding: BufferEncoding | "buffer" | null,
    agent: Agent
  ): Promise<string> {
    const result = this.getActiveFileSystem(agent)
      .readFile(path, encoding || "utf-8");
    return result;
  }

  async rename(oldPath: string, newPath: string, agent: Agent): Promise<boolean> {
    return this.getActiveFileSystem(agent)
      .rename(oldPath, newPath);
  }

  async exists(path: string, agent: Agent): Promise<boolean> {
    return this.getActiveFileSystem(agent).exists(path);
  }

  async stat(path: string, agent: Agent): Promise<StatLike> {
    return this.getActiveFileSystem(agent)
      .stat(path);
  }

  async createDirectory(
    path: string,
    options: { recursive?: boolean },
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);

    return this.getActiveFileSystem(agent)
      .createDirectory(path, options);
  }

  async copy(
    source: string,
    destination: string,
    options: { overwrite?: boolean },
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);

    return this.getActiveFileSystem(agent)
      .copy(source, destination, options);
  }

  async glob(
    pattern: string,
    options: Optional<GlobOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<string[]> {
    const activeFileSystem = this.getActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    return activeFileSystem.glob(pattern, options as GlobOptions);
  }

  async watch(
    dir: string,
    options: Optional<WatchOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<any> {
    const activeFileSystem = this.getActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    return activeFileSystem.watch(dir, options as WatchOptions);
  }

  async executeCommand(
    command: string | string[],
    options: Partial<ExecuteCommandOptions>,
    agent: Agent
  ): Promise<ExecuteCommandResult> {
    this.setDirty(true, agent);
    const activeFileSystem = this.getActiveFileSystem(agent);
    return activeFileSystem.executeCommand(command, { timeoutSeconds: 120, ...options});
  }

  getCommandSafetyLevel(shellString: string): "safe" | "unknown" | "dangerous" {
    for (const dangerousCommand of this.dangerousCommands) {
      if (dangerousCommand.test(shellString)) {
        return "dangerous";
      }
    }

    const commands = this.parseCompoundCommand(shellString.toLowerCase());
    for (let command of commands) {
      command = command.trim();
      if (!this.config.safeCommands.some((pattern) => command.startsWith(pattern))) {
        return "unknown";
      }
    }
    return "safe";
  }

  /**
   * Parse compound commands to extract individual commands
   * Handles cases like: "cd frontend/chat && bun add lucide-react"
   * Returns: ["cd", "bun"]
   */
  parseCompoundCommand(command: string): string[] {
    // Split by common command separators
    const separators = ["&&", "||", ";", "|"];
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
    options: Optional<GrepOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<GrepResult[]> {
    const activeFileSystem = this.getActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    return activeFileSystem.grep(searchString, options as GrepOptions);
  }

  setDirty(dirty: boolean, agent: Agent): void {
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.dirty = dirty;
    })
  }

  isDirty(agent: Agent): boolean {
    return agent.getState(FileSystemState).dirty;
  }

  // chat file selection
  async addFileToChat(file: string, agent: Agent): Promise<void> {
    if (!(await this.exists(file, agent))) {
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
      if (!(await this.exists(file, agent))) {
        throw new Error(`Could not find file to add to chat: ${file}`);
      }
    }
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.selectedFiles = new Set(files);
    });
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
      }, agent)) {
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
      title: "File Selection",
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
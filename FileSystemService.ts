import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingService} from "@tokenring-ai/app/types";
import deepMerge from "@tokenring-ai/utility/object/deepMerge";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import {z} from "zod";
import FileSystemProvider, {
  type DirectoryTreeOptions,
  type GlobOptions,
  type GrepOptions,
  type GrepResult,
  type StatLike,
  type WatchOptions
} from "./FileSystemProvider.js";
import {FileSystemAgentConfigSchema, FileSystemConfigSchema} from "./schema.ts";
import {FileSystemState} from "./state/fileSystemState.js";
import createIgnoreFilter from "./util/createIgnoreFilter.ts";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService implements TokenRingService {
  name = "FileSystemService";
  description = "Abstract interface for virtual file system operations";

  protected defaultProvider!: FileSystemProvider;

  private fileSystemProviderRegistry =
    new KeyedRegistry<FileSystemProvider>();

  registerFileSystemProvider = this.fileSystemProviderRegistry.register;
  requireFileSystemProviderByName = this.fileSystemProviderRegistry.requireItemByName;

  /**
   * Creates an instance of FileSystem
   */
  constructor(private options: z.output<typeof FileSystemConfigSchema>) {
  }

  run(): void {
    // Throws an error if the default provider is not registered, since this is most likely a mistake
    this.defaultProvider = this.fileSystemProviderRegistry.requireItemByName(this.options.agentDefaults.provider);
  }


  attach(agent: Agent): void {
    const config = deepMerge(this.options.agentDefaults, agent.getAgentConfigSlice('filesystem', FileSystemAgentConfigSchema))
    agent.initializeState(FileSystemState, config);
    if (config.selectedFiles.length > 0) {
      agent.infoMessage(`Selected files: ${config.selectedFiles.join(', ')}`);
    }
  }

  requireActiveFileSystem(agent: Agent): FileSystemProvider {
    const { providerName } = agent.getState(FileSystemState);
    if (! providerName) throw new Error("No file system provider configured for agent");
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
    const activeFileSystem = this.requireActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    yield* activeFileSystem.getDirectoryTree(path, options as DirectoryTreeOptions);
  }

  // file ops
  async writeFile(path: string, content: string | Buffer, agent: Agent): Promise<boolean> {
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent)
      .writeFile(path, content);
  }

  async appendFile(
    filePath: string,
    finalContent: string | Buffer,
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent)
      .appendFile(filePath, finalContent);
  }

  async deleteFile(path: string, agent: Agent): Promise<boolean> {
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent).deleteFile(path);
  }

  async readTextFile(path: string, agent: Agent): Promise<string | null> {
    const buf = await this.readFile(path, agent);
    return buf ? buf.toString("utf-8") : null;
  }

  async readFile(
    path: string,
    agent: Agent
  ): Promise<Buffer|null> {
    return this.requireActiveFileSystem(agent).readFile(path);
  }

  async rename(oldPath: string, newPath: string, agent: Agent): Promise<boolean> {
    return this.requireActiveFileSystem(agent)
      .rename(oldPath, newPath);
  }

  async exists(path: string, agent: Agent): Promise<boolean> {
    return this.requireActiveFileSystem(agent).exists(path);
  }

  async stat(path: string, agent: Agent): Promise<StatLike> {
    return this.requireActiveFileSystem(agent)
      .stat(path);
  }

  async createDirectory(
    path: string,
    options: { recursive?: boolean },
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);

    return this.requireActiveFileSystem(agent)
      .createDirectory(path, options);
  }

  async copy(
    source: string,
    destination: string,
    options: { overwrite?: boolean },
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);

    return this.requireActiveFileSystem(agent)
      .copy(source, destination, options);
  }

  async glob(
    pattern: string,
    options: Optional<GlobOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<string[]> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    return activeFileSystem.glob(pattern, options as GlobOptions);
  }

  async watch(
    dir: string,
    options: Optional<WatchOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<any> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
    return activeFileSystem.watch(dir, options as WatchOptions);
  }



  async grep(
    searchString: string | string[],
    options: Optional<GrepOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<GrepResult[]> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
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
}
import Agent from "@tokenring-ai/agent/Agent";
import type {AgentCreationContext} from "@tokenring-ai/agent/types";
import {TokenRingService} from "@tokenring-ai/app/types";
import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import deepMerge from "@tokenring-ai/utility/object/deepMerge";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import path from "node:path";
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

export type FileValidator = (path: string, content: string) => Promise<string | null>;

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService implements TokenRingService {
  readonly name = "FileSystemService";
  description = "Abstract interface for virtual file system operations";

  protected defaultProvider!: FileSystemProvider;

  private fileSystemProviderRegistry =
    new KeyedRegistry<FileSystemProvider>();

  registerFileSystemProvider = this.fileSystemProviderRegistry.register;
  requireFileSystemProviderByName = this.fileSystemProviderRegistry.requireItemByName;

  private fileValidatorRegistry = new KeyedRegistry<FileValidator>();
  registerFileValidator = this.fileValidatorRegistry.register;
  getFileValidatorForExtension = this.fileValidatorRegistry.getItemByName;

  /**
   * Creates an instance of FileSystem
   */
  constructor(private options: z.output<typeof FileSystemConfigSchema>) {
  }

  start(): void {
    // Throws an error if the default provider is not registered, since this is most likely a mistake
    this.defaultProvider = this.fileSystemProviderRegistry.requireItemByName(this.options.agentDefaults.provider);
  }


  attach(agent: Agent, creationContext: AgentCreationContext): void {
    const config = deepMerge(this.options.agentDefaults, agent.getAgentConfigSlice('filesystem', FileSystemAgentConfigSchema))
    agent.initializeState(FileSystemState, config);
    if (config.selectedFiles.length > 0) {
      creationContext.items.push(`Selected Files: ${config.selectedFiles.join(', ')}`);
    }
    creationContext.items.push(`Working Directory: ${config.workingDirectory}`);
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

  private getWorkingDirectory(agent: Agent): string {
    return agent.getState(FileSystemState).workingDirectory;
  }

  private resolveAbsolutePath(filePath: string, agent: Agent): string {
    const workingDirectory = this.getWorkingDirectory(agent);
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(workingDirectory, filePath);

    const relativePath = path.relative(workingDirectory, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Path ${filePath} is outside the root directory`);
    }

    return absolutePath;
  }

  private resolveAbsolutePattern(pattern: string, agent: Agent): string {
    return path.isAbsolute(pattern)
      ? this.resolveAbsolutePath(pattern, agent)
      : path.resolve(this.getWorkingDirectory(agent), pattern);
  }

  private relativePathForAgent(absolutePath: string, agent: Agent): string {
    const hasTrailingSeparator = absolutePath.endsWith("/") || absolutePath.endsWith(path.sep);
    const relativePath = path.relative(this.getWorkingDirectory(agent), this.resolveAbsolutePath(absolutePath, agent));
    return hasTrailingSeparator ? `${relativePath}/` : relativePath;
  }

  // Directory walking
  async* getDirectoryTree(
    path: string,
    options: Optional<DirectoryTreeOptions, "ignoreFilter"> = {},
    agent: Agent
  ): AsyncGenerator<string> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    const ignoreFilter = options.ignoreFilter ?? await createIgnoreFilter({
      exists: (filePath: string) => this.exists(filePath, agent),
      readFile: (filePath: string) => this.readFile(filePath, agent),
    });
    for await (const entry of activeFileSystem.getDirectoryTree(this.resolveAbsolutePath(path, agent), {
      ...options,
      ignoreFilter: (filePath: string) => ignoreFilter(this.relativePathForAgent(filePath, agent)),
    } as DirectoryTreeOptions)) {
      yield this.relativePathForAgent(entry, agent);
    }
  }

  // file ops
  async writeFile(path: string, content: string | Buffer, agent: Agent): Promise<boolean> {
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent)
      .writeFile(this.resolveAbsolutePath(path, agent), content);
  }

  async appendFile(
    filePath: string,
    finalContent: string | Buffer,
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent)
      .appendFile(this.resolveAbsolutePath(filePath, agent), finalContent);
  }

  async deleteFile(path: string, agent: Agent): Promise<boolean> {
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent).deleteFile(this.resolveAbsolutePath(path, agent));
  }

  async readTextFile(path: string, agent: Agent): Promise<string | null> {
    const buf = await this.readFile(path, agent);
    return buf ? buf.toString("utf-8") : null;
  }

  async readFile(
    path: string,
    agent: Agent
  ): Promise<Buffer|null> {
    return this.requireActiveFileSystem(agent).readFile(this.resolveAbsolutePath(path, agent));
  }

  async rename(oldPath: string, newPath: string, agent: Agent): Promise<boolean> {
    return this.requireActiveFileSystem(agent)
      .rename(this.resolveAbsolutePath(oldPath, agent), this.resolveAbsolutePath(newPath, agent));
  }

  async exists(path: string, agent: Agent): Promise<boolean> {
    try {
      return this.requireActiveFileSystem(agent).exists(this.resolveAbsolutePath(path, agent));
    } catch (_error) {
      return false;
    }
  }

  async stat(path: string, agent: Agent): Promise<StatLike> {
    return this.requireActiveFileSystem(agent)
      .stat(this.resolveAbsolutePath(path, agent))
      .then((result) => result.exists ? {
        ...result,
        path: this.relativePathForAgent(result.path, agent),
        absolutePath: result.absolutePath ?? this.resolveAbsolutePath(result.path, agent),
      } : {
        ...result,
        path: this.relativePathForAgent(result.path, agent),
      });
  }

  async getModifiedTimeNanos(path: string, agent: Agent): Promise<number | null> {
    const stat = await this.stat(path,agent);
    if (stat.exists) {
      const result = stat.modified?.getTime() ?? 0;
      return result > 0 ? result : null;
    }
    return null;
  }

  async createDirectory(
    path: string,
    options: { recursive?: boolean },
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);

    return this.requireActiveFileSystem(agent)
      .createDirectory(this.resolveAbsolutePath(path, agent), options);
  }

  async copy(
    source: string,
    destination: string,
    options: { overwrite?: boolean },
    agent: Agent
  ): Promise<boolean> {
    this.setDirty(true, agent);

    return this.requireActiveFileSystem(agent)
      .copy(this.resolveAbsolutePath(source, agent), this.resolveAbsolutePath(destination, agent), options);
  }

  async glob(
    pattern: string,
    options: Optional<GlobOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<string[]> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    const ignoreFilter = options.ignoreFilter ?? await createIgnoreFilter({
      exists: (filePath: string) => this.exists(filePath, agent),
      readFile: (filePath: string) => this.readFile(filePath, agent),
    });
    return (await activeFileSystem.glob(this.resolveAbsolutePattern(pattern, agent), {
      ...options,
      ignoreFilter: (filePath: string) => ignoreFilter(this.relativePathForAgent(filePath, agent)),
    } as GlobOptions))
      .map((filePath) => this.relativePathForAgent(filePath, agent));
  }

  async watch(
    dir: string,
    options: Optional<WatchOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<any> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    const ignoreFilter = options.ignoreFilter ?? await createIgnoreFilter({
      exists: (filePath: string) => this.exists(filePath, agent),
      readFile: (filePath: string) => this.readFile(filePath, agent),
    });
    return activeFileSystem.watch(this.resolveAbsolutePath(dir, agent), {
      ...options,
      ignoreFilter: (filePath: string) => ignoreFilter(this.relativePathForAgent(filePath, agent)),
    } as WatchOptions);
  }



  async grep(
    searchString: string | string[],
    options: Optional<GrepOptions, "ignoreFilter">,
    agent: Agent
  ): Promise<GrepResult[]> {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    const ignoreFilter = options.ignoreFilter ?? await createIgnoreFilter({
      exists: (filePath: string) => this.exists(filePath, agent),
      readFile: (filePath: string) => this.readFile(filePath, agent),
    });
    return (await activeFileSystem.grep(searchString, {
      ...options,
      cwd: this.getWorkingDirectory(agent),
      ignoreFilter: (filePath: string) => ignoreFilter(this.relativePathForAgent(filePath, agent)),
    } as GrepOptions))
      .map((result) => ({...result, file: this.relativePathForAgent(result.file, agent)}));
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

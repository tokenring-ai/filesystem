import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentCreationContext } from "@tokenring-ai/agent/types";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import EnhancedSet from "@tokenring-ai/utility/set/enhancedSet";
import type { z } from "zod";
import type { DirectoryTreeOptions, FileSystemProvider, FileSystemWatcher, GrepOptions, GrepResult, StatLike, WatchOptions } from "./FileSystemProvider.js";
import type { AllowedPath } from "./schema.ts";
import { FileSystemAgentConfigSchema, FileSystemConfigSchema } from "./schema.ts";
import { FileSystemState } from "./state/fileSystemState.ts";
import { allowedPathsForProvider, authorizePath, type PathAccess, PathNotAllowedError, pathIsWithin } from "./util/allowedPaths.ts";
import { findFirstMagicIndex } from "./util/fallbackGlob.ts";
import { type ArchivedVersionSummary, archivePreviousVersion, listArchivedVersions, readArchivedVersion } from "./util/fileArchive.ts";
import { RefreshingTreeIgnore, TreeIgnore, type TreeIgnoreIO, type WalkIgnoreOptions } from "./util/treeIgnore.ts";

export type TreeWalkOptions = WalkIgnoreOptions & { recursive?: boolean | undefined };
export type GlobWalkOptions = WalkIgnoreOptions & {
  /** Absolute, allow-listed directory relative glob patterns are resolved against. */
  cwd?: string | undefined;
  includeDirectories?: boolean | undefined;
};
export type GrepWalkOptions = WalkIgnoreOptions & {
  /** Absolute, allow-listed directory to walk. Required. */
  cwd?: string | undefined;
  includeContent?: GrepOptions["includeContent"] | undefined;
};
export type WatchWalkOptions = WalkIgnoreOptions & {
  pollInterval?: number | undefined;
  stabilityThreshold?: number | undefined;
};

/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 *
 * Paths are absolute within the active provider's namespace and are authorized
 * against the workspace allow-list (`filesystem.allowedPaths`). Relative paths
 * from internal callers (services, config) resolve against the workspace
 * directory, which is implicitly write-allowed for the default provider.
 */
export default class FileSystemService implements TokenRingService {
  readonly name = "FileSystemService";
  description = "Abstract interface for virtual file system operations";

  protected defaultProvider!: FileSystemProvider;

  private fileSystemProviderRegistry = new KeyedRegistry<FileSystemProvider>();

  registerFileSystemProvider = this.fileSystemProviderRegistry.set;
  unregisterFileSystemProvider = this.fileSystemProviderRegistry.unregister;
  requireFileSystemProviderByName = this.fileSystemProviderRegistry.require;
  getFilesystemProviderNames = this.fileSystemProviderRegistry.keysArray;

  private options: z.output<typeof FileSystemConfigSchema> = FileSystemConfigSchema.parse({});

  constructor(
    private readonly app: TokenRingApp,
    options?: z.output<typeof FileSystemConfigSchema>,
  ) {
    if (options) this.options = options;
  }

  reconfigure(options: z.output<typeof FileSystemConfigSchema>): void {
    this.options = options;
  }

  start(): void {
    // Throws an error if the default provider is not registered, since this is most likely a mistake
    this.defaultProvider = this.fileSystemProviderRegistry.require(this.options.agentDefaults.provider);
  }

  attach(agent: Agent, creationContext: AgentCreationContext): void {
    // oxlint-disable-next-line typescript/no-deprecated -- strips the legacy key from merged config
    const { workingDirectory: _deprecated, ...config } = deepClone(
      this.options.agentDefaults,
      agent.getAgentConfigSlice("filesystem", FileSystemAgentConfigSchema),
    );
    const initialState = agent.initializeState(FileSystemState, config);
    if (initialState.selectedFiles.size > 0) {
      creationContext.items.push(`Selected Files: ${initialState.selectedFiles.valuesArray().join(", ")}`);
    }
    const allowedPaths = this.getAllowedPaths(initialState.providerName ?? undefined);
    creationContext.items.push(`Allowed Paths: ${allowedPaths.map(entry => `${entry.path} (${entry.permission})`).join(", ") || "(none)"}`);
  }

  requireActiveFileSystem(agent: Agent): FileSystemProvider {
    const { providerName } = agent.getState(FileSystemState);
    if (!providerName) throw new Error("No file system provider configured for agent");
    return this.fileSystemProviderRegistry.require(providerName);
  }

  setActiveFileSystem(providerName: string, agent: Agent): void {
    this.fileSystemProviderRegistry.require(providerName);
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.providerName = providerName;
    });
  }

  // Path authorization

  /** The configured allow-list as-is (no provider filtering, no implicit workspace entry). */
  getConfiguredAllowedPaths(): AllowedPath[] {
    return this.options.allowedPaths;
  }

  /** The provider name new agents default to (and unscoped allow-list entries apply to). */
  getDefaultProviderName(): string {
    return this.options.agentDefaults.provider;
  }

  /**
   * Workspace allow-list for a provider (default: the default provider), with
   * the implicit workspace-directory entry appended.
   */
  getAllowedPaths(providerName?: string): AllowedPath[] {
    const defaultProvider = this.options.agentDefaults.provider;
    return allowedPathsForProvider({
      entries: this.options.allowedPaths,
      provider: providerName ?? defaultProvider,
      defaultProvider,
      workspaceDirectory: this.app.appConfig.workspaceDirectory,
    });
  }

  /**
   * Internal-path resolution: absolute paths pass through normalized; relative
   * paths (service/config callers only — agent tool inputs must be absolute)
   * resolve against the workspace directory.
   */
  resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(this.app.appConfig.workspaceDirectory, filePath);
  }

  /**
   * Resolve and authorize a path for the agent's active provider. Returns the
   * normalized absolute path; throws PathNotAllowedError with the allowed
   * roots listed otherwise.
   */
  authorizePath(filePath: string, access: PathAccess, agent: Agent): Promise<string> {
    const { providerName } = agent.getState(FileSystemState);
    if (!providerName) throw new Error("No file system provider configured for agent");
    return this.authorizePathForProvider(filePath, access, providerName);
  }

  /** Same authorization for callers that have a provider name but no agent (watchers, terminals). */
  authorizePathForProvider(filePath: string, access: PathAccess, providerName: string): Promise<string> {
    const provider = this.fileSystemProviderRegistry.require(providerName);
    return authorizePath(this.resolvePath(filePath), access, {
      entries: this.options.allowedPaths,
      provider: providerName,
      defaultProvider: this.options.agentDefaults.provider,
      workspaceDirectory: this.app.appConfig.workspaceDirectory,
      realpath: provider.realpath?.bind(provider),
    });
  }

  private providerIO(provider: FileSystemProvider): TreeIgnoreIO {
    return {
      readFile: async (filePath: string) => {
        try {
          return await provider.readFile(filePath);
        } catch {
          return null;
        }
      },
      exists: async (filePath: string) => {
        try {
          return await provider.exists(filePath);
        } catch {
          return false;
        }
      },
    };
  }

  // Directory walking
  async *getDirectoryTree(dirPath: string, options: TreeWalkOptions = {}, agent: Agent): AsyncGenerator<string> {
    const { recursive, ...ignoreOptions } = options;
    const activeFileSystem = this.requireActiveFileSystem(agent);
    const root = await this.authorizePath(dirPath, "read", agent);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.providerIO(activeFileSystem));
    yield* activeFileSystem.getDirectoryTree(root, {
      ignoreFilter: treeIgnore.shouldIgnore,
      ...(recursive !== undefined && { recursive }),
    } as DirectoryTreeOptions);
  }

  // file ops

  /** Subscribes to successful file writes (absolute provider paths). Returns an unsubscribe function. */
  onFileWritten(listener: (absolutePath: string) => void): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  private writeListeners = new Set<(absolutePath: string) => void>();

  private notifyFileWritten(absolutePath: string): void {
    for (const listener of this.writeListeners) {
      try {
        listener(absolutePath);
      } catch {
        // Listener errors must never break the write path.
      }
    }
  }

  /**
   * Reads the content that is about to be overwritten and queues it for
   * archiving (best-effort, off the write path's critical latency). Returns the
   * promise so callers may await it when they need ordering guarantees.
   */
  private archiveBeforeWrite(provider: FileSystemProvider, target: string): Promise<void> {
    const archiveConfig = this.options.archive;
    if (!archiveConfig.enabled) return Promise.resolve();
    return Promise.resolve(provider.readFile(target))
      .then(previous => {
        if (!previous) return;
        return archivePreviousVersion({
          config: archiveConfig,
          workspaceDirectory: this.app.appConfig.workspaceDirectory,
          absolutePath: target,
          previousContent: previous,
        });
      })
      .catch(() => {
        // Archiving is best-effort; never surface failures to the write path.
      });
  }

  async writeFile(filePath: string, content: string | Buffer, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(filePath, "write", agent);
    const activeFileSystem = this.requireActiveFileSystem(agent);
    await this.archiveBeforeWrite(activeFileSystem, target);
    this.setDirty(true, agent);
    const result = await activeFileSystem.writeFile(target, content);
    this.notifyFileWritten(target);
    return result;
  }

  /**
   * Agentless write for internal services and HTTP resources: same archive and
   * notification behavior as {@link writeFile}, resolved against the default
   * provider's namespace without permission state.
   */
  async writeSystemFile(filePath: string, content: string | Buffer): Promise<boolean> {
    const target = this.resolvePath(filePath);
    await this.archiveBeforeWrite(this.defaultProvider, target);
    const result = await this.defaultProvider.writeFile(target, content);
    this.notifyFileWritten(target);
    return result;
  }

  async appendFile(filePath: string, finalContent: string | Buffer, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(filePath, "write", agent);
    const activeFileSystem = this.requireActiveFileSystem(agent);
    await this.archiveBeforeWrite(activeFileSystem, target);
    this.setDirty(true, agent);
    const result = await activeFileSystem.appendFile(target, finalContent);
    this.notifyFileWritten(target);
    return result;
  }

  async deleteFile(filePath: string, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(filePath, "write", agent);
    this.setDirty(true, agent);
    return this.requireActiveFileSystem(agent).deleteFile(target);
  }

  /**
   * Recursively delete a directory for an agent. See {@link deleteDirectoryForProvider}.
   */
  async deleteDirectory(dirPath: string, agent: Agent): Promise<boolean> {
    const { providerName } = agent.getState(FileSystemState);
    if (!providerName) throw new Error("No file system provider configured for agent");
    this.setDirty(true, agent);
    return this.deleteDirectoryForProvider(dirPath, providerName);
  }

  /**
   * Recursively delete a directory. The path must be write-authorized by the
   * allow-list (symlinks resolved), and may not be an allowed root, the
   * workspace or working directory, or anything containing one of them.
   */
  async deleteDirectoryForProvider(dirPath: string, providerName: string): Promise<boolean> {
    const provider = this.fileSystemProviderRegistry.require(providerName);
    if (!provider.deleteDirectory) {
      throw new Error(`The ${providerName} filesystem does not support deleting directories`);
    }
    const target = await this.authorizePathForProvider(dirPath, "write", providerName);
    await this.assertDeletableDirectory(target, provider, providerName);
    const stat = await provider.stat(target);
    if (!stat.exists) throw new Error(`Directory ${target} does not exist`);
    if (!stat.isDirectory) throw new Error(`Path ${target} is not a directory`);
    return provider.deleteDirectory(target);
  }

  /** Throws when `target` is a protected directory (an allowed root, the workspace, or one of their ancestors). */
  private async assertDeletableDirectory(target: string, provider: FileSystemProvider, providerName: string): Promise<void> {
    const protectedRoots = this.getAllowedPaths(providerName).map(entry => entry.path);
    if (providerName === this.options.agentDefaults.provider) {
      protectedRoots.push(path.resolve(this.app.appConfig.workspaceDirectory), path.resolve(this.app.appConfig.workingDirectory));
    }
    // Check the symlink-resolved location too, so a path through a linked parent cannot reach a protected root.
    const candidates = [target];
    if (provider.realpath) {
      try {
        const real = await provider.realpath(target);
        if (real !== target) candidates.push(real);
      } catch {
        // Missing paths are reported by the caller's stat.
      }
    }
    for (const candidate of candidates) {
      if (candidate === path.parse(candidate).root) {
        throw new PathNotAllowedError(`Refusing to delete the filesystem root`);
      }
      for (const root of protectedRoots) {
        if (pathIsWithin(candidate, root)) {
          throw new PathNotAllowedError(
            candidate === path.resolve(root)
              ? `Refusing to delete ${target}: it is an allowed root directory`
              : `Refusing to delete ${target}: it contains the allowed directory ${root}`,
          );
        }
      }
    }
  }

  /**
   * Count what a recursive delete would remove (read-authorized). Stops at
   * `limit` entries and reports `truncated`.
   */
  async countDirectoryEntriesForProvider(
    dirPath: string,
    providerName: string,
    limit = 100_000,
  ): Promise<{ files: number; directories: number; truncated: boolean }> {
    const provider = this.fileSystemProviderRegistry.require(providerName);
    const target = await this.authorizePathForProvider(dirPath, "read", providerName);
    let files = 0;
    let directories = 0;
    for await (const entry of provider.getDirectoryTree(target, { ignoreFilter: () => false, recursive: true })) {
      if (entry.endsWith("/") || entry.endsWith(path.sep)) directories++;
      else files++;
      if (files + directories >= limit) return { files, directories, truncated: true };
    }
    return { files, directories, truncated: false };
  }

  // archived versions

  /** Archived previous versions of a file (workspace-relative or absolute path), newest first. */
  async listVersions(filePath: string): Promise<ArchivedVersionSummary[]> {
    const archiveConfig = this.options.archive;
    if (!archiveConfig.enabled) return [];
    return listArchivedVersions(archiveConfig, this.app.appConfig.workspaceDirectory, this.resolvePath(filePath));
  }

  /** Content of one archived version, or null when the version does not exist. */
  async readVersion(filePath: string, versionId: string): Promise<Buffer | null> {
    const archiveConfig = this.options.archive;
    if (!archiveConfig.enabled) return null;
    return readArchivedVersion(archiveConfig, this.app.appConfig.workspaceDirectory, this.resolvePath(filePath), versionId);
  }

  async readFile(filePath: string, agent: Agent): Promise<Buffer | null> {
    const target = await this.authorizePath(filePath, "read", agent);
    return this.requireActiveFileSystem(agent).readFile(target);
  }

  async readTextFile(filePath: string, agent: Agent): Promise<string | null> {
    const buf = await this.readFile(filePath, agent);
    return buf ? buf.toString("utf-8") : null;
  }

  async rename(oldPath: string, newPath: string, agent: Agent): Promise<boolean> {
    const source = await this.authorizePath(oldPath, "write", agent);
    const destination = await this.authorizePath(newPath, "write", agent);
    return this.requireActiveFileSystem(agent).rename(source, destination);
  }

  async exists(filePath: string, agent: Agent): Promise<boolean> {
    try {
      const target = await this.authorizePath(filePath, "read", agent);
      return await this.requireActiveFileSystem(agent).exists(target);
    } catch {
      return false;
    }
  }

  async stat(filePath: string, agent: Agent): Promise<StatLike> {
    const target = await this.authorizePath(filePath, "read", agent);
    const result = await this.requireActiveFileSystem(agent).stat(target);
    if (result.exists) {
      return {
        ...result,
        path: target,
        absolutePath: result.absolutePath ?? target,
      };
    }

    return {
      ...result,
      path: target,
    };
  }

  async getModifiedTimeNanos(filePath: string, agent: Agent): Promise<number | null> {
    const stat = await this.stat(filePath, agent);
    if (stat.exists) {
      const result = stat.modified?.getTime() ?? 0;
      return result > 0 ? result : null;
    }
    return null;
  }

  async createDirectory(dirPath: string, options: { recursive?: boolean | undefined }, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(dirPath, "write", agent);
    this.setDirty(true, agent);

    return this.requireActiveFileSystem(agent).createDirectory(target, options);
  }

  async copy(source: string, destination: string, options: { overwrite?: boolean | undefined }, agent: Agent): Promise<boolean> {
    const sourcePath = await this.authorizePath(source, "read", agent);
    const destinationPath = await this.authorizePath(destination, "write", agent);
    this.setDirty(true, agent);

    return this.requireActiveFileSystem(agent).copy(sourcePath, destinationPath, options);
  }

  /**
   * Match files against a glob pattern. Absolute patterns walk their non-magic
   * prefix; relative patterns require `options.cwd`. Results are absolute.
   */
  async glob(pattern: string, options: GlobWalkOptions, agent: Agent): Promise<string[]> {
    const { cwd, includeDirectories = false, ...ignoreOptions } = options;
    const activeFileSystem = this.requireActiveFileSystem(agent);

    let absolutePattern: string;
    if (path.isAbsolute(pattern)) {
      absolutePattern = path.normalize(pattern);
    } else {
      if (!cwd) {
        throw new PathNotAllowedError(
          `Relative glob pattern "${pattern}" requires an absolute "cwd" to resolve against. ` +
            `Pass a cwd inside an allowed directory, or use an absolute pattern:\n` +
            this.getAllowedPaths(agent.getState(FileSystemState).providerName ?? undefined)
              .map(entry => `- ${entry.path} (${entry.permission})`)
              .join("\n"),
        );
      }
      const base = await this.authorizePath(cwd, "read", agent);
      absolutePattern = path.join(base, pattern);
    }

    const magicIndex = findFirstMagicIndex(absolutePattern);

    // Exact (non-magic) pattern: stat it directly instead of walking the parent.
    if (magicIndex === -1) {
      const target = await this.authorizePath(absolutePattern, "read", agent);
      const stat = await activeFileSystem.stat(target);
      if (!stat.exists) return [];
      if (stat.isDirectory && !includeDirectories) return [];
      const treeIgnore = new TreeIgnore(path.dirname(target), ignoreOptions, this.providerIO(activeFileSystem));
      if (await treeIgnore.shouldIgnore(target, stat.isDirectory ?? false)) return [];
      return [target];
    }

    const prefix = absolutePattern.slice(0, magicIndex);
    const walkRoot = prefix.endsWith("/") ? prefix.replace(/\/+$/, "") || "/" : path.dirname(prefix);
    const root = await this.authorizePath(walkRoot, "read", agent);

    const matcher = new Bun.Glob(absolutePattern);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.providerIO(activeFileSystem));
    const results = new Set<string>();

    const rootStat = await activeFileSystem.stat(root);
    if (!rootStat.exists) return [];

    for await (const entry of activeFileSystem.getDirectoryTree(root, {
      recursive: true,
      ignoreFilter: treeIgnore.shouldIgnore,
    } as DirectoryTreeOptions)) {
      const isDirectory = entry.endsWith("/") || entry.endsWith(path.sep);
      if (isDirectory && !includeDirectories) continue;
      const candidate = isDirectory ? entry.replace(/[/\\]+$/, "") : entry;
      if (matcher.match(candidate)) results.add(candidate);
    }

    return [...results].sort();
  }

  async watch(dir: string, options: WatchWalkOptions, agent: Agent): Promise<FileSystemWatcher> {
    const { pollInterval, stabilityThreshold, ...ignoreOptions } = options;
    const activeFileSystem = this.requireActiveFileSystem(agent);
    if (!activeFileSystem.watch) {
      throw new Error(`Watch is not supported by the active file system`);
    }
    const root = await this.authorizePath(dir, "read", agent);
    const treeIgnore = new RefreshingTreeIgnore(root, ignoreOptions, this.providerIO(activeFileSystem));
    return activeFileSystem.watch(root, {
      ignoreFilter: treeIgnore.shouldIgnore,
      ...(pollInterval !== undefined && { pollInterval }),
      ...(stabilityThreshold !== undefined && { stabilityThreshold }),
    } as WatchOptions);
  }

  /** Search file contents under `options.cwd` (required, absolute, allow-listed). */
  async grep(searchString: string | string[], options: GrepWalkOptions, agent: Agent): Promise<GrepResult[]> {
    const { cwd, includeContent, ...ignoreOptions } = options;
    const activeFileSystem = this.requireActiveFileSystem(agent);
    if (!activeFileSystem.grep) {
      throw new Error(`Grep is not supported by the active file system`);
    }
    if (!cwd) {
      throw new PathNotAllowedError(
        `grep requires an absolute "cwd" to walk. Allowed directories:\n` +
          this.getAllowedPaths(agent.getState(FileSystemState).providerName ?? undefined)
            .map(entry => `- ${entry.path} (${entry.permission})`)
            .join("\n"),
      );
    }
    const root = await this.authorizePath(cwd, "read", agent);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.providerIO(activeFileSystem));
    return await activeFileSystem.grep(searchString, {
      cwd: root,
      ignoreFilter: treeIgnore.shouldIgnore,
      ...(includeContent !== undefined && { includeContent }),
    } as GrepOptions);
  }

  /**
   * Agentless content search for UI callers: `cwd` is read-authorized against
   * the provider's allow-list, ignore rules apply, and at most `maxResults`
   * matching lines are returned (`truncated` says whether more exist).
   */
  async grepForProvider(
    searchString: string,
    options: WalkIgnoreOptions & { cwd: string; maxResults: number; ignoreCase?: boolean | undefined },
    providerName: string,
  ): Promise<{ matches: GrepResult[]; truncated: boolean }> {
    const { cwd, maxResults, ignoreCase, ...ignoreOptions } = options;
    const provider = this.fileSystemProviderRegistry.require(providerName);
    if (!provider.grep) {
      throw new Error(`The ${providerName} filesystem does not support content search`);
    }
    const root = await this.authorizePathForProvider(cwd, "read", providerName);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.providerIO(provider));
    // One extra match tells us whether the list was cut short.
    const results = await provider.grep(searchString, {
      cwd: root,
      ignoreFilter: treeIgnore.shouldIgnore,
      maxResults: maxResults + 1,
      ...(ignoreCase !== undefined && { ignoreCase }),
    });
    return { matches: results.slice(0, maxResults), truncated: results.length > maxResults };
  }

  supportsGrep(agent: Agent) {
    const activeFileSystem = this.requireActiveFileSystem(agent);
    return !!activeFileSystem.grep;
  }

  setDirty(dirty: boolean, agent: Agent): void {
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.dirty = dirty;
    });
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
        throw new Error(`File ${file} was not found in the chat context and could not be removed.`);
      }
    });
  }

  getFilesInChat(agent: Agent): EnhancedSet<string> {
    return agent.getState(FileSystemState).selectedFiles;
  }

  async setFilesInChat(files: Iterable<string>, agent: Agent): Promise<void> {
    for (const file of files) {
      if (!(await this.exists(file, agent))) {
        throw new Error(`Could not find file to add to chat: ${file}`);
      }
    }
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.selectedFiles = new EnhancedSet(files);
    });
  }

  /**
   * Probe a possibly-relative user-facing path (mention, /file argument)
   * against the allowed roots; returns the first existing absolute match, or
   * null. Absolute inputs are returned when they exist.
   */
  async probeMentionedPath(mention: string, agent: Agent): Promise<string | null> {
    if (path.isAbsolute(mention)) {
      return (await this.exists(mention, agent)) ? path.resolve(mention) : null;
    }
    const { providerName } = agent.getState(FileSystemState);
    for (const entry of this.getAllowedPaths(providerName ?? undefined)) {
      const candidate = path.join(entry.path, mention);
      if (await this.exists(candidate, agent)) return candidate;
    }
    return null;
  }
}

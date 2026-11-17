import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentCreationContext } from "@tokenring-ai/agent/types";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import EnhancedSet from "@tokenring-ai/utility/set/enhancedSet";
import type { z } from "zod";
import type { DirectoryTreeOptions, FileSystemWatcher, GrepOptions, GrepResult, IgnorePredicate, StatLike, WatchOptions } from "./FileSystemTypes.ts";
import HostFileSystem from "./HostFileSystem.ts";
import type { AllowedPath } from "./schema.ts";
import { FileSystemAgentConfigSchema, FileSystemConfigSchema } from "./schema.ts";
import { FileSystemState } from "./state/fileSystemState.ts";
import { allowedPathsFor, authorizePath, findAllowedRoot, type PathAccess, PathNotAllowedError, pathIsWithin } from "./util/allowedPaths.ts";
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
 * The host machine's filesystem, as agents and the UI see it.
 *
 * Paths are absolute host paths authorized against the workspace allow-list
 * (`filesystem.allowedPaths`). Relative paths from internal callers (services,
 * config) resolve against the workspace directory, which is implicitly
 * write-allowed. Remote stores such as Google Drive are not filesystems and do
 * not go through this service.
 */
export default class FileSystemService implements TokenRingService {
  readonly name = "FileSystemService";
  description = "The host filesystem, authorized against the workspace allow-list";

  private options: z.output<typeof FileSystemConfigSchema> = FileSystemConfigSchema.parse({});

  constructor(
    private readonly app: TokenRingApp,
    options?: z.output<typeof FileSystemConfigSchema>,
    /** The host filesystem implementation. Tests pass an in-memory one. */
    readonly host: HostFileSystem = new HostFileSystem(),
  ) {
    if (options) this.options = options;
  }

  reconfigure(options: z.output<typeof FileSystemConfigSchema>): void {
    this.options = options;
  }

  attach(agent: Agent, creationContext: AgentCreationContext): void {
    // oxlint-disable-next-line typescript/no-deprecated -- strips the legacy keys from merged config
    const { workingDirectory: _deprecated, ...config } = deepClone(
      this.options.agentDefaults,
      agent.getAgentConfigSlice("filesystem", FileSystemAgentConfigSchema),
    );
    const initialState = agent.initializeState(FileSystemState, config);
    if (initialState.selectedFiles.size > 0) {
      creationContext.items.push(`Selected Files: ${initialState.selectedFiles.valuesArray().join(", ")}`);
    }
    const allowedPaths = this.getAllowedPaths();
    creationContext.items.push(`Allowed Paths: ${allowedPaths.map(entry => `${entry.path} (${entry.permission})`).join(", ") || "(none)"}`);
  }

  // Path authorization

  /** The configured allow-list as-is (no implicit workspace entry). */
  getConfiguredAllowedPaths(): AllowedPath[] {
    return this.options.allowedPaths;
  }

  /** The workspace allow-list with the implicit workspace-directory entry appended. */
  getAllowedPaths(): AllowedPath[] {
    return allowedPathsFor({ entries: this.options.allowedPaths, workspaceDirectory: this.app.appConfig.workspaceDirectory });
  }

  /** Directories (the workspace directory included) whose files agents' file tools may write. */
  getWritablePaths(): string[] {
    return this.getAllowedPaths()
      .filter(entry => entry.permission === "write")
      .map(entry => entry.path);
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
   * Resolve and authorize a path against the allow-list. Returns the normalized
   * absolute path; throws PathNotAllowedError with the allowed roots listed
   * otherwise. Agentless callers (watchers, terminals, the UI) use this too.
   */
  authorizePath(filePath: string, access: PathAccess, _agent?: Agent): Promise<string> {
    return authorizePath(this.resolvePath(filePath), access, {
      entries: this.options.allowedPaths,
      workspaceDirectory: this.app.appConfig.workspaceDirectory,
      realpath: path => this.host.realpath(path),
    });
  }

  /** The allowed-path entry (implicit workspace entry included) that covers `target`, or null. */
  findCoveringEntry(target: string): AllowedPath | null {
    return findAllowedRoot(path.resolve(target), this.getAllowedPaths());
  }

  /**
   * Archive location inputs for `target`. Files in the workspace use workspace-relative keys; files under
   * another allowed path are keyed by absolute path, with exclude rules matched relative to that allowed
   * path. Returns null for a path outside every allowed path (nothing is archived or readable there).
   */
  private archiveScope(target: string): { excludeRelativePath?: string } | null {
    const resolved = path.resolve(target);
    if (pathIsWithin(path.resolve(this.app.appConfig.workspaceDirectory), resolved)) return {};
    const entry = this.findCoveringEntry(resolved);
    if (!entry) return null;
    return { excludeRelativePath: path.relative(entry.path, resolved) };
  }

  /**
   * Wraps an ignore predicate for walks that read file contents: an entry whose real path leaves
   * the allow-list (a symlink to a file or folder outside it) is skipped, not just the walk's root.
   */
  private skipOutsideAllowList(ignore: IgnorePredicate): IgnorePredicate {
    return async (filePath, isDirectory) => {
      if (await ignore(filePath, isDirectory)) return true;
      try {
        await this.authorizePath(filePath, "read");
        return false;
      } catch {
        return true;
      }
    };
  }

  private hostIO(): TreeIgnoreIO {
    return {
      readFile: async (filePath: string) => {
        try {
          return await this.host.readFile(filePath);
        } catch {
          return null;
        }
      },
      exists: async (filePath: string) => {
        try {
          return await this.host.exists(filePath);
        } catch {
          return false;
        }
      },
    };
  }

  // Directory walking
  async *getDirectoryTree(dirPath: string, options: TreeWalkOptions = {}, agent: Agent): AsyncGenerator<string> {
    const { recursive, ...ignoreOptions } = options;
    const root = await this.authorizePath(dirPath, "read", agent);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.hostIO());
    yield* this.host.getDirectoryTree(root, {
      ignoreFilter: treeIgnore.shouldIgnore,
      ...(recursive !== undefined && { recursive }),
    } as DirectoryTreeOptions);
  }

  // file ops

  /** Subscribes to successful file writes (absolute host paths). Returns an unsubscribe function. */
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
  private archiveBeforeWrite(target: string): Promise<void> {
    const archiveConfig = this.options.archive;
    if (!archiveConfig.enabled) return Promise.resolve();
    const scope = this.archiveScope(target);
    if (!scope) return Promise.resolve();
    return Promise.resolve(this.host.readFile(target))
      .then(previous => {
        if (!previous) return;
        return archivePreviousVersion({
          config: archiveConfig,
          workspaceDirectory: this.app.appConfig.workspaceDirectory,
          absolutePath: target,
          previousContent: previous,
          ...scope,
        });
      })
      .catch(() => {
        // Archiving is best-effort; never surface failures to the write path.
      });
  }

  async writeFile(filePath: string, content: string | Buffer, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(filePath, "write", agent);
    await this.archiveBeforeWrite(target);
    this.setDirty(true, agent);
    const result = await this.host.writeFile(target, content);
    this.notifyFileWritten(target);
    return result;
  }

  /**
   * Agentless write for internal services and HTTP resources: same archive and
   * notification behavior as {@link writeFile}, resolved against the default
   * workspace without permission state.
   */
  async writeSystemFile(filePath: string, content: string | Buffer): Promise<boolean> {
    const target = this.resolvePath(filePath);
    await this.archiveBeforeWrite(target);
    const result = await this.host.writeFile(target, content);
    this.notifyFileWritten(target);
    return result;
  }

  async appendFile(filePath: string, finalContent: string | Buffer, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(filePath, "write", agent);
    await this.archiveBeforeWrite(target);
    this.setDirty(true, agent);
    const result = await this.host.appendFile(target, finalContent);
    this.notifyFileWritten(target);
    return result;
  }

  async deleteFile(filePath: string, agent: Agent): Promise<boolean> {
    const target = await this.authorizePath(filePath, "write", agent);
    this.setDirty(true, agent);
    return this.host.deleteFile(target);
  }

  /**
   * Recursively delete a directory. The path must be write-authorized by the
   * allow-list (symlinks resolved), and may not be an allowed root, the
   * workspace or working directory, or anything containing one of them.
   * Without an agent (the UI), nothing is marked dirty.
   */
  async deleteDirectory(dirPath: string, agent?: Agent): Promise<boolean> {
    const target = await this.authorizePath(dirPath, "write");
    await this.assertDeletableDirectory(target);
    if (agent) this.setDirty(true, agent);
    const stat = await this.host.stat(target);
    if (!stat.exists) throw new Error(`Directory ${target} does not exist`);
    if (!stat.isDirectory) throw new Error(`Path ${target} is not a directory`);
    return this.host.deleteDirectory(target);
  }

  /** Throws when `target` is a protected directory (an allowed root, the workspace, or one of their ancestors). */
  private async assertDeletableDirectory(target: string): Promise<void> {
    const protectedRoots = this.getAllowedPaths().map(entry => entry.path);
    protectedRoots.push(path.resolve(this.app.appConfig.workspaceDirectory), path.resolve(this.app.appConfig.workingDirectory));
    // Check the symlink-resolved location too, so a path through a linked parent cannot reach a protected root.
    const candidates = [target];
    try {
      const real = await this.host.realpath(target);
      if (real !== target) candidates.push(real);
    } catch {
      // Missing paths are reported by the caller's stat.
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
  async countDirectoryEntries(dirPath: string, limit = 100_000): Promise<{ files: number; directories: number; truncated: boolean }> {
    const target = await this.authorizePath(dirPath, "read");
    let files = 0;
    let directories = 0;
    for await (const entry of this.host.getDirectoryTree(target, { ignoreFilter: () => false, recursive: true })) {
      if (entry.endsWith("/") || entry.endsWith(path.sep)) directories++;
      else files++;
      if (files + directories >= limit) return { files, directories, truncated: true };
    }
    return { files, directories, truncated: false };
  }

  // archived versions

  /** Archived previous versions of a file (workspace-relative or absolute path inside any allowed path), newest first. */
  async listVersions(filePath: string): Promise<ArchivedVersionSummary[]> {
    const archiveConfig = this.options.archive;
    if (!archiveConfig.enabled) return [];
    const target = this.resolvePath(filePath);
    const scope = this.archiveScope(target);
    if (!scope) return [];
    return listArchivedVersions(archiveConfig, this.app.appConfig.workspaceDirectory, target, scope.excludeRelativePath);
  }

  /** Content of one archived version, or null when the version does not exist. */
  async readVersion(filePath: string, versionId: string): Promise<Buffer | null> {
    const archiveConfig = this.options.archive;
    if (!archiveConfig.enabled) return null;
    const target = this.resolvePath(filePath);
    const scope = this.archiveScope(target);
    if (!scope) return null;
    return readArchivedVersion(archiveConfig, this.app.appConfig.workspaceDirectory, target, versionId, scope.excludeRelativePath);
  }

  async readFile(filePath: string, agent: Agent): Promise<Buffer | null> {
    const target = await this.authorizePath(filePath, "read", agent);
    return this.host.readFile(target);
  }

  async readTextFile(filePath: string, agent: Agent): Promise<string | null> {
    const buf = await this.readFile(filePath, agent);
    return buf ? buf.toString("utf-8") : null;
  }

  async rename(oldPath: string, newPath: string, agent: Agent): Promise<boolean> {
    const source = await this.authorizePath(oldPath, "write", agent);
    const destination = await this.authorizePath(newPath, "write", agent);
    return this.host.rename(source, destination);
  }

  async exists(filePath: string, agent: Agent): Promise<boolean> {
    try {
      const target = await this.authorizePath(filePath, "read", agent);
      return await this.host.exists(target);
    } catch {
      return false;
    }
  }

  async stat(filePath: string, agent: Agent): Promise<StatLike> {
    const target = await this.authorizePath(filePath, "read", agent);
    const result = await this.host.stat(target);
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

    return this.host.createDirectory(target, options);
  }

  async copy(source: string, destination: string, options: { overwrite?: boolean | undefined }, agent: Agent): Promise<boolean> {
    const sourcePath = await this.authorizePath(source, "read", agent);
    const destinationPath = await this.authorizePath(destination, "write", agent);
    this.setDirty(true, agent);

    return this.host.copy(sourcePath, destinationPath, options);
  }

  /**
   * Match files against a glob pattern. Absolute patterns walk their non-magic
   * prefix; relative patterns require `options.cwd`. Results are absolute.
   */
  async glob(pattern: string, options: GlobWalkOptions, agent: Agent): Promise<string[]> {
    const { cwd, includeDirectories = false, ...ignoreOptions } = options;

    let absolutePattern: string;
    if (path.isAbsolute(pattern)) {
      absolutePattern = path.normalize(pattern);
    } else {
      if (!cwd) {
        throw new PathNotAllowedError(
          `Relative glob pattern "${pattern}" requires an absolute "cwd" to resolve against. ` +
            `Pass a cwd inside an allowed directory, or use an absolute pattern:\n` +
            this.getAllowedPaths()
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
      const stat = await this.host.stat(target);
      if (!stat.exists) return [];
      if (stat.isDirectory && !includeDirectories) return [];
      const treeIgnore = new TreeIgnore(path.dirname(target), ignoreOptions, this.hostIO());
      if (await treeIgnore.shouldIgnore(target, stat.isDirectory ?? false)) return [];
      return [target];
    }

    const prefix = absolutePattern.slice(0, magicIndex);
    const walkRoot = prefix.endsWith("/") ? prefix.replace(/\/+$/, "") || "/" : path.dirname(prefix);
    const root = await this.authorizePath(walkRoot, "read", agent);

    const matcher = new Bun.Glob(absolutePattern);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.hostIO());
    const results = new Set<string>();

    const rootStat = await this.host.stat(root);
    if (!rootStat.exists) return [];

    for await (const entry of this.host.getDirectoryTree(root, {
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
    const root = await this.authorizePath(dir, "read", agent);
    const treeIgnore = new RefreshingTreeIgnore(root, ignoreOptions, this.hostIO());
    return this.host.watch(root, {
      ignoreFilter: treeIgnore.shouldIgnore,
      ...(pollInterval !== undefined && { pollInterval }),
      ...(stabilityThreshold !== undefined && { stabilityThreshold }),
    } as WatchOptions);
  }

  /** Search file contents under `options.cwd` (required, absolute, allow-listed). */
  async grep(searchString: string | string[], options: GrepWalkOptions, agent: Agent): Promise<GrepResult[]> {
    const { cwd, includeContent, ...ignoreOptions } = options;
    if (!cwd) {
      throw new PathNotAllowedError(
        `grep requires an absolute "cwd" to walk. Allowed directories:\n` +
          this.getAllowedPaths()
            .map(entry => `- ${entry.path} (${entry.permission})`)
            .join("\n"),
      );
    }
    const root = await this.authorizePath(cwd, "read", agent);
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.hostIO());
    return await this.host.grep(searchString, {
      cwd: root,
      ignoreFilter: this.skipOutsideAllowList(treeIgnore.shouldIgnore),
      ...(includeContent !== undefined && { includeContent }),
    } as GrepOptions);
  }

  /**
   * Agentless content search for UI callers: `cwd` is read-authorized against
   * the allow-list, ignore rules apply, and at most `maxResults` matching lines
   * are returned (`truncated` says whether more exist).
   */
  async searchContents(
    searchString: string,
    options: WalkIgnoreOptions & { cwd: string; maxResults: number; ignoreCase?: boolean | undefined },
  ): Promise<{ matches: GrepResult[]; truncated: boolean }> {
    const { cwd, maxResults, ignoreCase, ...ignoreOptions } = options;
    const root = await this.authorizePath(cwd, "read");
    const treeIgnore = new TreeIgnore(root, ignoreOptions, this.hostIO());
    // One extra match tells us whether the list was cut short.
    const results = await this.host.grep(searchString, {
      cwd: root,
      ignoreFilter: this.skipOutsideAllowList(treeIgnore.shouldIgnore),
      maxResults: maxResults + 1,
      ...(ignoreCase !== undefined && { ignoreCase }),
    });
    return { matches: results.slice(0, maxResults), truncated: results.length > maxResults };
  }

  setDirty(dirty: boolean, agent: Agent): void {
    agent.mutateState(FileSystemState, (state: FileSystemState) => {
      state.dirty = dirty;
      if (dirty) state.writeCount++;
    });
  }

  /** How many writes the agent has made; compare two readings to tell whether files changed in between. */
  getWriteCount(agent: Agent): number {
    return agent.getState(FileSystemState).writeCount;
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
    for (const entry of this.getAllowedPaths()) {
      const candidate = path.join(entry.path, mention);
      if (await this.exists(candidate, agent)) return candidate;
    }
    return null;
  }
}

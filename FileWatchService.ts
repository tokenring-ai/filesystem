import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { ConfigurationError } from "@tokenring-ai/app/types";
import QueueService from "@tokenring-ai/queue/QueueService";
import EnhancedStringMap from "@tokenring-ai/utility/map/enhancedStringMap";
import type { z } from "zod";
import type { FileSystemProvider, FileSystemWatcher } from "./FileSystemProvider.ts";
import FileSystemService from "./FileSystemService.ts";
import type { FileSystemConfigSchema, ParsedFileWatch } from "./schema.ts";
import detectMimeType from "./util/detectMimeType.ts";
import { isIgnoreFile, RefreshingTreeIgnore } from "./util/treeIgnore.ts";

type FileSystemConfig = z.output<typeof FileSystemConfigSchema>;

type ActiveWatch = {
  watcher: FileSystemWatcher;
  /** Absolute directory being watched. */
  absolutePath: string;
  config: ParsedFileWatch;
  include: RegExp | undefined;
  exclude: RegExp | undefined;
  contentIncludes: RegExp | undefined;
  /** Events before this timestamp are treated as bootstrap (initial scan) and ignored. */
  readyAt: number;
};

/**
 * Watches configured filesystem paths and runs actions when files stabilize after changes.
 *
 * Configured via {@link FileSystemConfigSchema}'s `watch` map. Currently supports submitting
 * the changed file path and contents to a named queue (`addToQueue`).
 */
export default class FileWatchService implements TokenRingService {
  readonly name = "FileWatchService";
  description = "Watches filesystem paths and triggers actions (e.g. enqueue) when files change";

  private options: FileSystemConfig | undefined;
  private readonly activeWatches = new EnhancedStringMap<ActiveWatch>();

  constructor(private readonly app: TokenRingApp) {}

  /**
   * Applies package config. Watchers are created in {@link start} (after filesystem
   * providers have been registered); later reconfigures re-reconcile live watchers.
   */
  async reconfigure(options: FileSystemConfig): Promise<void> {
    this.options = options;
    await this.activeWatches.reconcileAgainstAsync(options.watch, {
      creating: async (name, config) => this.openWatcher(name, config),
      deleting: async (_name, active) => {
        active.watcher.close();
      },
      updating: async (name, active, config) => {
        active.watcher.close();
        return this.openWatcher(name, config);
      },
    });
  }

  stop(): void {
    this.activeWatches.mapValues(active => active.watcher.close());
    this.activeWatches.clear();
  }

  private requireOptions(): FileSystemConfig {
    if (!this.options) {
      throw new ConfigurationError(this.name, "FileWatchService is not configured");
    }
    return this.options;
  }

  private async openWatcher(watchName: string, config: ParsedFileWatch): Promise<ActiveWatch> {
    const options = this.requireOptions();
    const providerName = config.provider ?? options.agentDefaults.provider;

    if (!path.isAbsolute(config.path)) {
      throw new ConfigurationError(this.name, `Watch "${watchName}" path must be absolute (got "${config.path}")`);
    }

    const fileSystemService = this.app.requireService(FileSystemService);
    const provider = fileSystemService.requireFileSystemProviderByName(providerName);

    if (!provider.watch) {
      throw new ConfigurationError(this.name, `File system provider '${providerName}' does not support watching`);
    }

    const absolutePath = await fileSystemService.authorizePathForProvider(config.path, "read", providerName);

    // Event-time ignore: rebuilt after a short TTL (and when an ignore file
    // changes), so .gitignore edits take effect while the watcher runs.
    const baseIgnore = new RefreshingTreeIgnore(
      absolutePath,
      {},
      {
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
      },
    );

    const include = config.include ? new RegExp(config.include) : undefined;
    const exclude = config.exclude ? new RegExp(config.exclude) : undefined;
    const contentIncludes = config.contentIncludes ? new RegExp(config.contentIncludes) : undefined;

    const watcher = await provider.watch(absolutePath, {
      pollInterval: Math.min(1000, Math.max(100, Math.floor(config.stabilityThreshold / 5))),
      stabilityThreshold: config.stabilityThreshold,
      ignoreFilter: async (filePath: string, isDirectory?: boolean) => {
        if (isIgnoreFile(filePath)) baseIgnore.invalidate();
        // include/exclude match paths relative to the watch root.
        const relativePath = this.toWatchRelativePath(filePath, absolutePath);
        if (await baseIgnore.shouldIgnore(filePath, isDirectory)) return true;
        if (exclude?.test(relativePath)) return true;
        if (include && !include.test(relativePath)) return true;
        return false;
      },
    });

    // Skip the watcher's initial scan of existing files; only react to subsequent changes.
    const active: ActiveWatch = {
      watcher,
      absolutePath,
      config,
      include,
      exclude,
      contentIncludes,
      readyAt: Date.now() + config.stabilityThreshold + 500,
    };

    const onFileEvent = (eventType: string, filePath: string) => {
      // Prefer the live map entry so tests/reconfigure can adjust readyAt.
      const current = this.activeWatches.get(watchName) ?? active;
      if (Date.now() < current.readyAt) return;
      if (eventType !== "add" && eventType !== "change") return;

      void this.handleStableFileChange(watchName, filePath, absolutePath, provider).catch(err => {
        this.app.serviceError(this, `Error handling change for watch "${watchName}" file ${filePath}:`, err);
      });
    };

    watcher
      .on("add", filePath => onFileEvent("add", filePath))
      .on("change", filePath => onFileEvent("change", filePath))
      .on("error", error => this.app.serviceError(this, `Error in file watcher "${watchName}":`, error));

    this.app.serviceOutput(this, `Watching "${watchName}" at ${absolutePath} (stability ${config.stabilityThreshold}ms)`);

    return active;
  }

  private async handleStableFileChange(watchName: string, absoluteFilePath: string, watchRoot: string, provider: FileSystemProvider): Promise<void> {
    const active = this.activeWatches.get(watchName);
    if (!active) return;

    const relativePath = this.toWatchRelativePath(absoluteFilePath, watchRoot);

    // Double-check path filters in case the watcher emitted a path that slipped past ignoreFilter.
    if (active.exclude?.test(relativePath)) return;
    if (active.include && !active.include.test(relativePath)) return;

    const buffer = await provider.readFile(absoluteFilePath);
    if (buffer == null) return;

    const contents = buffer.toString("utf-8");
    if (active.contentIncludes && !active.contentIncludes.test(contents)) return;

    for (const action of active.config.actions) {
      switch (action.action) {
        // oxlint-disable typescript/no-unnecessary-condition
        case "addToQueue":
          this.enqueueFile(action.queue, watchName, relativePath, contents);
          break;
        default: {
          const exhaustive: string = action.action satisfies never;
          throw new Error(`Unknown watch action: ${exhaustive}`);
        }
      }
    }
  }

  private enqueueFile(queueName: string, watchName: string, filePath: string, contents: string): void {
    const queueService = this.app.getService(QueueService);
    if (!queueService) {
      this.app.serviceError(this, `Cannot enqueue file from watch "${watchName}": QueueService is not installed`);
      return;
    }

    try {
      const item = queueService.enqueue(queueName, {
        name: filePath,
        input: {
          from: `Filesystem Watch (${watchName})`,
          message: `File changed: ${filePath}`,
          attachments: [
            {
              name: filePath,
              description: `Changed file from watch "${watchName}"`,
              encoding: "text",
              mimeType: detectMimeType(filePath),
              body: contents,
            },
          ],
        },
      });
      this.app.serviceOutput(this, `Enqueued "${filePath}" to queue "${queueName}" (id: ${item.id}) from watch "${watchName}"`);
    } catch (err: unknown) {
      this.app.serviceError(this, `Failed to enqueue "${filePath}" to queue "${queueName}":`, err);
    }
  }

  /** Path relative to the watch root (used for include/exclude matching and enqueue names). */
  private toWatchRelativePath(filePath: string, watchRoot: string): string {
    if (!path.isAbsolute(filePath)) return filePath;
    const relative = path.relative(watchRoot, filePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return filePath;
    }
    return relative;
  }
}

import path from "node:path";
import { AgentManager } from "@tokenring-ai/agent";
import { createAgentStateSliceStream } from "@tokenring-ai/agent/rpc/createAgentStateStream";
import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { encode8601dates } from "@tokenring-ai/utility/date/transform8601Dates";
import type { FileSystemProvider, IgnorePredicate } from "../FileSystemProvider.ts";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import { PathNotAllowedError, topLevelRoots } from "../util/allowedPaths.ts";
import fallbackGlob from "../util/fallbackGlob.ts";
import { TreeIgnore } from "../util/treeIgnore.ts";
import { invalidateWorkspaceFileIndex, listWorkspaceFiles } from "../util/workspaceFileIndex.ts";
import FileSystemRpcSchema from "./schema.ts";

function providerIO(provider: FileSystemProvider) {
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

/**
 * Root ignore state at the enclosing git repository (nearest ancestor with a
 * `.git`) when there is one, so ancestor .gitignore files apply while browsing
 * a subdirectory. Falls back to the directory itself.
 */
async function findIgnoreRoot(provider: FileSystemProvider, dir: string): Promise<string> {
  if (!path.isAbsolute(dir)) return dir;
  let current = path.resolve(dir);
  for (;;) {
    if (await providerIO(provider).exists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(dir);
}

/** Walk filter for browser listings: gitignore/aiignore rules only — hidden files stay a client-side toggle. */
async function browserIgnoreFilter(provider: FileSystemProvider, dir: string): Promise<IgnorePredicate> {
  const root = await findIgnoreRoot(provider, dir);
  const treeIgnore = new TreeIgnore(root, { includeHidden: true }, providerIO(provider));
  return treeIgnore.shouldIgnore;
}

/** Content-search lines longer than this are cut for display. */
const MAX_MATCH_LENGTH = 400;

const streamFilesystemState = createAgentStateSliceStream({
  SliceClass: FileSystemState,
  project: (state, agent) => ({
    status: "success" as const,
    provider: state.providerName ?? "",
    allowedPaths: agent.requireService(FileSystemService).getAllowedPaths(state.providerName ?? undefined),
    selectedFiles: state.selectedFiles.valuesArray(),
    readFiles: state.readFiles.toPlainObject(),
    dirty: state.dirty,
  }),
});

export default createRPCEndpoint(FileSystemRpcSchema, {
  getFilesystemProviders(_args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const providers = fs.getFilesystemProviderNames();
    return Promise.resolve({ providers });
  },

  getAllowedPaths(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    return Promise.resolve({ allowedPaths: fs.getAllowedPaths(args.provider) });
  },

  getDefaultDirectories(_args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    return Promise.resolve({
      workingDirectory: app.appConfig.workingDirectory,
      workspaceDirectory: app.appConfig.workspaceDirectory,
      defaultProvider: fs.getDefaultProviderName(),
    });
  },

  async readTextFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const content = await provider.readFile(args.path);
    return { content: content ? content.toString("utf-8") : null };
  },

  async readFileBase64(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const content = await provider.readFile(args.path);
    return { contentBase64: content ? content.toString("base64") : null };
  },

  async exists(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const exists = await provider.exists(args.path);
    return { exists };
  },

  async stat(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const stats = await provider.stat(args.path);
    return { stats: encode8601dates(stats, ["created", "modified", "accessed"]) };
  },

  async glob(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const globOptions = { ignoreFilter: () => false };
    const files = provider.glob ? await provider.glob(args.pattern, globOptions) : await fallbackGlob(provider, args.pattern, globOptions);
    return { files };
  },

  async searchWorkspaceFiles(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    // Walk every top-level allowed root for this provider; gitignore filtering is opt-in.
    const allFiles: string[] = [];
    for (const root of topLevelRoots(fs.getAllowedPaths(args.provider))) {
      const ignoreFilter = args.gitignore ? await browserIgnoreFilter(provider, root.path) : () => false;
      allFiles.push(
        ...(await listWorkspaceFiles(args.provider, provider, root.path, {
          ignoreFilter,
          variant: args.gitignore ? "gitignore" : "all",
        })),
      );
    }

    const query = args.query.trim().toLowerCase();
    let matches = allFiles;
    if (query) {
      matches = allFiles.filter(filePath => filePath.toLowerCase().includes(query));
    }

    const depth = (filePath: string) => (filePath.match(/\//g) ?? []).length;
    matches.sort((left, right) => {
      const depthDiff = depth(left) - depth(right);
      if (depthDiff !== 0) {
        return depthDiff;
      }
      const baseLeft = left.split("/").pop() ?? left;
      const baseRight = right.split("/").pop() ?? right;
      const baseCmp = baseLeft.localeCompare(baseRight, undefined, { numeric: true, sensitivity: "base" });
      if (baseCmp !== 0) {
        return baseCmp;
      }
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    });

    const totalMatches = matches.length;
    return { files: matches.slice(0, args.limit), totalMatches };
  },

  async listDirectory(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const ignoreFilter = args.gitignore ? await browserIgnoreFilter(provider, args.path) : () => false;
    const files: string[] = [];
    for await (const file of provider.getDirectoryTree(args.path, {
      recursive: args.recursive,
      ignoreFilter,
    })) {
      files.push(file);
    }
    return { files };
  },

  async writeFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const content = args.encoding === "base64" ? Buffer.from(args.content, "base64") : args.content;
    if (args.provider === fs.getDefaultProviderName()) {
      // Same path as internal writes: archives the overwritten version (see listFileVersions) and notifies watchers.
      await fs.writeSystemFile(args.path, content);
    } else {
      await fs.requireFileSystemProviderByName(args.provider).writeFile(args.path, content);
    }
    invalidateWorkspaceFileIndex(args.provider);
    return { success: true };
  },

  async appendFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.appendFile(args.path, args.content);
    return { success: true };
  },

  async deleteFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.deleteFile(args.path);
    invalidateWorkspaceFileIndex(args.provider);
    return { success: true };
  },

  async deleteDirectory(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    await fs.deleteDirectoryForProvider(args.path, args.provider);
    invalidateWorkspaceFileIndex(args.provider);
    return { success: true };
  },

  async countDirectoryEntries(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    return fs.countDirectoryEntriesForProvider(args.path, args.provider);
  },

  async searchFileContents(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const { matches, truncated } = await fs.grepForProvider(
      args.query,
      {
        cwd: args.path,
        maxResults: args.limit,
        ignoreCase: args.ignoreCase,
        includeHidden: args.includeHidden,
        gitignore: args.gitignore,
        aiignore: args.gitignore,
      },
      args.provider,
    );
    return {
      matches: matches.map(match => ({
        file: match.file,
        line: match.line,
        match: match.match.length > MAX_MATCH_LENGTH ? `${match.match.slice(0, MAX_MATCH_LENGTH)}…` : match.match,
      })),
      truncated,
    };
  },

  async listFileVersions(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    // The archive mirrors the default (host) filesystem only.
    if (args.provider !== fs.getDefaultProviderName()) return { versions: [] };
    try {
      const target = await fs.authorizePathForProvider(args.path, "read", args.provider);
      return { versions: await fs.listVersions(target) };
    } catch (error: unknown) {
      if (error instanceof PathNotAllowedError) return { versions: [] };
      throw error;
    }
  },

  async readFileVersion(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    if (args.provider !== fs.getDefaultProviderName()) return { content: null };
    const target = await fs.authorizePathForProvider(args.path, "read", args.provider);
    const content = await fs.readVersion(target, args.versionId);
    return { content: content ? content.toString("utf-8") : null };
  },

  async rename(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.rename(args.oldPath, args.newPath);
    invalidateWorkspaceFileIndex(args.provider);
    return { success: true };
  },

  async createDirectory(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.createDirectory(args.path, { recursive: args.recursive });
    invalidateWorkspaceFileIndex(args.provider);
    return { success: true };
  },

  async copy(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.copy(args.source, args.destination, {
      overwrite: args.overwrite,
    });
    invalidateWorkspaceFileIndex(args.provider);
    return { success: true };
  },

  getFilesystemState(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }
    const state = agent.getState(FileSystemState);
    const fs = app.requireService(FileSystemService);
    return Promise.resolve({
      status: "success",
      provider: state.providerName ?? "",
      allowedPaths: fs.getAllowedPaths(state.providerName ?? undefined),
      selectedFiles: state.selectedFiles.valuesArray(),
      readFiles: state.readFiles.toPlainObject(),
      dirty: state.dirty,
    });
  },

  streamFilesystemState,

  async addFileToChat(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }
    const fs = app.requireService(FileSystemService);
    await fs.addFileToChat(args.file, agent);
    return { status: "success", success: true };
  },

  removeFileFromChat(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }
    const fs = app.requireService(FileSystemService);
    fs.removeFileFromChat(args.file, agent);
    return { status: "success", success: true };
  },
});

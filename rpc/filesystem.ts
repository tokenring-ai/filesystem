import { AgentManager } from "@tokenring-ai/agent";
import { createAgentStateSliceStream } from "@tokenring-ai/agent/rpc/createAgentStateStream";
import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { encode8601dates } from "@tokenring-ai/utility/date/transform8601Dates";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import { PathNotAllowedError, topLevelRoots } from "../util/allowedPaths.ts";
import browserIgnoreFilter from "../util/browserIgnoreFilter.ts";
import { invalidateWorkspaceFileIndex, listWorkspaceFiles } from "../util/workspaceFileIndex.ts";
import FileSystemRpcSchema from "./schema.ts";

/** Content-search lines longer than this are cut for display. */
const MAX_MATCH_LENGTH = 400;

const streamFilesystemState = createAgentStateSliceStream({
  SliceClass: FileSystemState,
  project: (state, agent) => ({
    status: "success" as const,
    allowedPaths: agent.requireService(FileSystemService).getAllowedPaths(),
    selectedFiles: state.selectedFiles.valuesArray(),
    readFiles: state.readFiles.toPlainObject(),
    dirty: state.dirty,
  }),
});

export default createRPCEndpoint(FileSystemRpcSchema, {
  getAllowedPaths(_args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    return Promise.resolve({ allowedPaths: fs.getAllowedPaths() });
  },

  getDefaultDirectories(_args, app: TokenRingApp) {
    return Promise.resolve({
      workingDirectory: app.appConfig.workingDirectory,
      workspaceDirectory: app.appConfig.workspaceDirectory,
    });
  },

  async readTextFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    const content = await provider.readFile(args.path);
    return { content: content ? content.toString("utf-8") : null };
  },

  async readFileBase64(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    const content = await provider.readFile(args.path);
    return { contentBase64: content ? content.toString("base64") : null };
  },

  async exists(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    const exists = await provider.exists(args.path);
    return { exists };
  },

  async stat(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    const stats = await provider.stat(args.path);
    return { stats: encode8601dates(stats, ["created", "modified", "accessed"]) };
  },

  async glob(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    const globOptions = { ignoreFilter: () => false };
    const files = await provider.glob(args.pattern, globOptions);
    return { files };
  },

  async searchWorkspaceFiles(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    // Walk every top-level allowed root; gitignore filtering is opt-in.
    const allFiles: string[] = [];
    for (const root of topLevelRoots(fs.getAllowedPaths())) {
      const ignoreFilter = args.gitignore ? await browserIgnoreFilter(provider, root.path) : () => false;
      allFiles.push(
        ...(await listWorkspaceFiles(provider, root.path, {
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
    const provider = fs.host;
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
    // Same path as internal writes: archives the overwritten version (see listFileVersions) and notifies watchers.
    await fs.writeSystemFile(args.path, content);
    invalidateWorkspaceFileIndex();
    return { success: true };
  },

  async appendFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    await provider.appendFile(args.path, args.content);
    return { success: true };
  },

  async deleteFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    await provider.deleteFile(args.path);
    invalidateWorkspaceFileIndex();
    return { success: true };
  },

  async deleteDirectory(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    await fs.deleteDirectory(args.path);
    invalidateWorkspaceFileIndex();
    return { success: true };
  },

  async countDirectoryEntries(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    return fs.countDirectoryEntries(args.path);
  },

  async searchFileContents(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const { matches, truncated } = await fs.searchContents(args.query, {
      cwd: args.path,
      maxResults: args.limit,
      ignoreCase: args.ignoreCase,
      includeHidden: args.includeHidden,
      gitignore: args.gitignore,
      aiignore: args.gitignore,
    });
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
    try {
      const target = await fs.authorizePath(args.path, "read");
      return { versions: await fs.listVersions(target) };
    } catch (error: unknown) {
      if (error instanceof PathNotAllowedError) return { versions: [] };
      throw error;
    }
  },

  async readFileVersion(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const target = await fs.authorizePath(args.path, "read");
    const content = await fs.readVersion(target, args.versionId);
    return { content: content ? content.toString("utf-8") : null };
  },

  async rename(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    await provider.rename(args.oldPath, args.newPath);
    invalidateWorkspaceFileIndex();
    return { success: true };
  },

  async createDirectory(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    await provider.createDirectory(args.path, { recursive: args.recursive });
    invalidateWorkspaceFileIndex();
    return { success: true };
  },

  async copy(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.host;
    await provider.copy(args.source, args.destination, {
      overwrite: args.overwrite,
    });
    invalidateWorkspaceFileIndex();
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
      allowedPaths: fs.getAllowedPaths(),
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

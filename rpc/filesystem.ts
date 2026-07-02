import { AgentManager } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import { createAgentStateSliceStream } from "@tokenring-ai/rpc/createAgentStateStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { encode8601dates } from "@tokenring-ai/utility/date/transform8601Dates";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import fallbackGlob from "../util/fallbackGlob.ts";
import { invalidateWorkspaceFileIndex, listWorkspaceFiles } from "../util/workspaceFileIndex.ts";
import FileSystemRpcSchema from "./schema.ts";

const streamFilesystemState = createAgentStateSliceStream({
  SliceClass: FileSystemState,
  project: state => ({
    status: "success" as const,
    provider: state.providerName ?? "",
    workingDirectory: state.workingDirectory,
    selectedFiles: Array.from(state.selectedFiles),
    readFiles: Object.fromEntries(state.readFiles),
    dirty: state.dirty,
  }),
});

export default createRPCEndpoint(FileSystemRpcSchema, {
  getFilesystemProviders(_args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const providers = fs.getFilesystemProviderNames();
    return Promise.resolve({ providers });
  },

  async readTextFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const content = await provider.readFile(args.path);
    return { content: content ? content.toString("utf-8") : null };
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
    const globOptions = { ignoreFilter: () => false };
    const allFiles = await listWorkspaceFiles(args.provider, provider, globOptions);

    const query = args.query.trim().toLowerCase();
    let matches = allFiles;
    if (query) {
      matches = allFiles.filter((filePath) => filePath.toLowerCase().includes(query));
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
    const files: string[] = [];
    for await (const file of provider.getDirectoryTree(args.path, {
      recursive: args.recursive,
      ignoreFilter: () => false,
    })) {
      files.push(file);
    }
    return { files };
  },

  async writeFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.writeFile(args.path, args.content);
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
    return Promise.resolve({
      status: "success",
      provider: state.providerName ?? "",
      workingDirectory: state.workingDirectory,
      selectedFiles: Array.from(state.selectedFiles),
      readFiles: Object.fromEntries(state.readFiles),
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

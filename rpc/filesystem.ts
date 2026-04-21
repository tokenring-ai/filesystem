import {AgentManager} from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import {createRPCEndpoint} from "@tokenring-ai/rpc/createRPCEndpoint";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import fallbackGlob from "../util/fallbackGlob.ts";
import FileSystemRpcSchema from "./schema.ts";

export default createRPCEndpoint(FileSystemRpcSchema, {
  getFilesystemProviders(_args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const providers = fs.getFilesystemProviderNames();
    return Promise.resolve({providers});
  },

  async readTextFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const content = await provider.readFile(args.path);
    return {content: content ? content.toString("utf-8") : null};
  },

  async exists(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const exists = await provider.exists(args.path);
    return {exists};
  },

  async stat(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const stats = await provider.stat(args.path);
    return {stats: JSON.stringify(stats)};
  },

  async glob(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    const globOptions = {ignoreFilter: () => false};
    const files = provider.glob
      ? await provider.glob(args.pattern, globOptions)
      : await fallbackGlob(provider, args.pattern, globOptions);
    return {files};
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
    return {files};
  },

  async writeFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.writeFile(args.path, args.content);
    return {success: true};
  },

  async appendFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.appendFile(args.path, args.content);
    return {success: true};
  },

  async deleteFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.deleteFile(args.path);
    return {success: true};
  },

  async rename(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.rename(args.oldPath, args.newPath);
    return {success: true};
  },

  async createDirectory(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.createDirectory(args.path, {recursive: args.recursive});
    return {success: true};
  },

  async copy(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const provider = fs.requireFileSystemProviderByName(args.provider);
    await provider.copy(args.source, args.destination, {
      overwrite: args.overwrite,
    });
    return {success: true};
  },

  getFilesystemState(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return {status: 'agentNotFound'};
    }
    const state = agent.getState(FileSystemState);
    return Promise.resolve({
      status: 'success',
      provider: state.providerName ?? "",
      workingDirectory: state.workingDirectory,
      selectedFiles: Array.from(state.selectedFiles),
      readFiles: Object.fromEntries(state.readFiles),
      dirty: state.dirty,
    });
  },

  async addFileToChat(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return {status: 'agentNotFound'};
    }
    const fs = app.requireService(FileSystemService);
    await fs.addFileToChat(args.file, agent);
    return {status: 'success', success: true};
  },

  removeFileFromChat(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return {status: 'agentNotFound'};
    }
    const fs = app.requireService(FileSystemService);
    fs.removeFileFromChat(args.file, agent);
    return {status: 'success', success: true};
  },
});

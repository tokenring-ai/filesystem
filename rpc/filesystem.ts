import {AgentManager} from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import { createJsonRPCEndpoint } from "@tokenring-ai/web-host/jsonrpc/createJsonRPCEndpoint";
import FileSystemService from "../FileSystemService.js";
import FileSystemRpcSchema from "./schema.ts";

export default createJsonRPCEndpoint(FileSystemRpcSchema, {
  async readFile(args, app: TokenRingApp) {
    const fs = app.requireService(FileSystemService);
    const content = await fs.readFile(args.path, args.encoding as BufferEncoding);
    return { content };
  },

  async exists(args, app) {
    const fs = app.requireService(FileSystemService);
    const exists = await fs.exists(args.path);
    return { exists };
  },

  async stat(args, app) {
    const fs = app.requireService(FileSystemService);
    const stats = await fs.stat(args.path);
    return { stats: JSON.stringify(stats) };
  },

  async glob(args, app) {
    const fs = app.requireService(FileSystemService);
    const files = await fs.glob(args.pattern);
    return { files };
  },

  async listDirectory(args, app) {
    const fs = app.requireService(FileSystemService);
    const files: string[] = [];
    for await (const file of fs.getDirectoryTree(args.path, { recursive: args.recursive })) {
      files.push(file);
    }
    return { files };
  },

  async writeFile(args, app) {
    const fs = app.requireService(FileSystemService);
    await fs.writeFile(args.path, args.content);
    return { success: true };
  },

  async appendFile(args, app) {
    const fs = app.requireService(FileSystemService);
    await fs.appendFile(args.path, args.content);
    return { success: true };
  },

  async deleteFile(args, app) {
    const fs = app.requireService(FileSystemService);
    await fs.deleteFile(args.path);
    return { success: true };
  },

  async rename(args, app) {
    const fs = app.requireService(FileSystemService);
    await fs.rename(args.oldPath, args.newPath);
    return { success: true };
  },

  async createDirectory(args, app) {
    const fs = app.requireService(FileSystemService);
    await fs.createDirectory(args.path, { recursive: args.recursive });
    return { success: true };
  },

  async copy(args, app) {
    const fs = app.requireService(FileSystemService);
    await fs.copy(args.source, args.destination, { overwrite: args.overwrite });
    return { success: true };
  },

  async addFileToChat(args, app) {
    const fs = app.requireService(FileSystemService);
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    await fs.addFileToChat(args.file, agent);
    return { success: true };
  },

  async getSelectedFiles(args, app) {
    const fs = app.requireService(FileSystemService);
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const files = fs.getFilesInChat(agent);
    return { files: Array.from(files) };
  },
});

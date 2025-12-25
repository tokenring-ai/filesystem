import {AgentManager} from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import {createJsonRPCEndpoint} from "@tokenring-ai/web-host/jsonrpc/createJsonRPCEndpoint";
import FileSystemService from "../FileSystemService.js";
import FileSystemRpcSchema from "./schema.ts";

export default createJsonRPCEndpoint(FileSystemRpcSchema, {
  async readFile(args, app: TokenRingApp) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    const content = await fs.readFile(args.path, "utf-8", agent);
    return { content };
  },

  async exists(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    const exists = await fs.exists(args.path, agent);
    return { exists };
  },

  async stat(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    const stats = await fs.stat(args.path, agent);
    return { stats: JSON.stringify(stats) };
  },

  async glob(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    const files = await fs.glob(args.pattern, {}, agent);
    return { files };
  },

  async listDirectory(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    const files: string[] = [];
    for await (const file of fs.getDirectoryTree(args.path, {
      recursive: args.recursive,
      ignoreFilter: args.showHidden ? (path) => false : undefined
    }, agent)) {
      files.push(file);
    }
    return { files };
  },

  async writeFile(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.writeFile(args.path, args.content, agent);
    return { success: true };
  },

  async appendFile(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.appendFile(args.path, args.content, agent);
    return { success: true };
  },

  async deleteFile(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.deleteFile(args.path, agent);
    return { success: true };
  },

  async rename(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.rename(args.oldPath, args.newPath, agent);
    return { success: true };
  },

  async createDirectory(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.createDirectory(args.path, {recursive: args.recursive}, agent);
    return { success: true };
  },

  async copy(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.copy(args.source, args.destination, {overwrite: args.overwrite}, agent);
    return { success: true };
  },

  async addFileToChat(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    await fs.addFileToChat(args.file, agent);
    return { success: true };
  },

  removeFileFromChat(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    fs.removeFileFromChat(args.file, agent);
    return { success: true };
  },

  async getSelectedFiles(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) throw new Error("Agent not found");
    const fs = app.requireService(FileSystemService);
    const files = fs.getFilesInChat(agent);
    return { files: Array.from(files) };
  },
});

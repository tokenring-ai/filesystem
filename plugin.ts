import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService, ContextualSearchService } from "@tokenring-ai/chat";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import { RpcService } from "@tokenring-ai/rpc";
import { ScriptingService } from "@tokenring-ai/scripting";
import type { ScriptingThis } from "@tokenring-ai/scripting/ScriptingService";
import { WebHostService } from "@tokenring-ai/web-host";
import { z } from "zod";
import agentCommands from "./commands.ts";
import allowedPathsContextHandler from "./contextHandlers/allowedPaths.ts";
import FilesystemContextualSearchProvider from "./contextualSearch/FilesystemContextualSearchProvider.ts";
import FileSystemHttpResource from "./FileSystemHttpResource.ts";
import FileSystemService from "./FileSystemService.ts";
import FileWatchService from "./FileWatchService.ts";
import addSelectedFiles from "./hooks/addSelectedFiles.ts";
import addSimilarFiles from "./hooks/addSimilarFiles.ts";
import clearReadFiles from "./hooks/clearReadFiles.ts";
import packageJSON from "./package.json" with { type: "json" };
import filesystemRPC from "./rpc/filesystem.ts";
import { FileSystemConfigSchema } from "./schema.ts";
import tools from "./tools.ts";

const packageConfigSchema = z.object({
  filesystem: FileSystemConfigSchema.exactOptional(),
});

export default {
  name: packageJSON.name,
  displayName: "Filesystem Abstraction",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    app.waitForService(ScriptingService, (scriptingService: ScriptingService) => {
      scriptingService.registerFunction("createFile", {
        type: "native",
        params: ["path", "content"],
        async execute(this: ScriptingThis, path: string, content: string): Promise<string> {
          await this.agent.requireService(FileSystemService).writeFile(path, content, this.agent);
          return `Created file: ${path}`;
        },
      });

      scriptingService.registerFunction("deleteFile", {
        type: "native",
        params: ["path"],
        async execute(this: ScriptingThis, path: string): Promise<string> {
          await this.agent.requireService(FileSystemService).deleteFile(path, this.agent);
          return `Deleted file: ${path}`;
        },
      });

      scriptingService.registerFunction("globFiles", {
        type: "native",
        params: ["pattern", "cwd"],
        async execute(this: ScriptingThis, pattern: string, cwd?: string): Promise<string[]> {
          return await this.agent.requireService(FileSystemService).glob(pattern, cwd ? { cwd } : {}, this.agent);
        },
      });

      scriptingService.registerFunction("searchFiles", {
        type: "native",
        params: ["searchString", "cwd"],
        async execute(this: ScriptingThis, searchString: string, cwd?: string): Promise<string[]> {
          const results = await this.agent.requireService(FileSystemService).grep([searchString], cwd ? { cwd } : {}, this.agent);
          return results.map(r => `${r.file}:${r.line}: ${r.match}`);
        },
      });
    });
    app.waitForService(ChatService, chatService => {
      chatService.addTools(tools);
      chatService.registerContextHandler("allowed-paths", allowedPathsContextHandler);
    });
    app.waitForService(ContextualSearchService, service => {
      service.registerProvider("file", new FilesystemContextualSearchProvider(app));
    });

    app.waitForService(AgentLifecycleService, lifecycleService => lifecycleService.addHooks(clearReadFiles, addSelectedFiles, addSimilarFiles));
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
    app.addService(FileSystemService, new FileSystemService(app));
    app.addService(FileWatchService, new FileWatchService(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(filesystemRPC);
    });

    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource("Workspace Filesystem", new FileSystemHttpResource(app));
    });
  },
  async reconfigure(app, config) {
    if (config.filesystem) {
      app.requireService(FileSystemService).reconfigure(config.filesystem);
      await app.requireService(FileWatchService).reconfigure(config.filesystem);
    }
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;

import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import { RpcService } from "@tokenring-ai/rpc";
import { ScriptingService } from "@tokenring-ai/scripting";
import type { ScriptingThis } from "@tokenring-ai/scripting/ScriptingService";
import { z } from "zod";
import agentCommands from "./commands.ts";
import contextHandlers from "./contextHandlers.ts";
import FileSystemService from "./FileSystemService.ts";
import hooks from "./hooks.ts";
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
  install(app, config) {
    if (config.filesystem) {
      app.waitForService(ScriptingService, (scriptingService: ScriptingService) => {
        scriptingService.registerFunction("createFile", {
          type: "native",
          params: ["path", "content"],
          async execute(this: ScriptingThis, path: string, content: string): Promise<string> {
            await this.agent.requireServiceByType(FileSystemService).writeFile(path, content, this.agent);
            return `Created file: ${path}`;
          },
        });

        scriptingService.registerFunction("deleteFile", {
          type: "native",
          params: ["path"],
          async execute(this: ScriptingThis, path: string): Promise<string> {
            await this.agent.requireServiceByType(FileSystemService).deleteFile(path, this.agent);
            return `Deleted file: ${path}`;
          },
        });

        scriptingService.registerFunction("globFiles", {
          type: "native",
          params: ["pattern"],
          async execute(this: ScriptingThis, pattern: string): Promise<string[]> {
            return await this.agent.requireServiceByType(FileSystemService).glob(pattern, {}, this.agent);
          },
        });

        scriptingService.registerFunction("searchFiles", {
          type: "native",
          params: ["searchString"],
          async execute(this: ScriptingThis, searchString: string): Promise<string[]> {
            const results = await this.agent.requireServiceByType(FileSystemService).grep([searchString], {}, this.agent);
            return results.map(r => `${r.file}:${r.line}: ${r.match}`);
          },
        });
      });
      app.waitForService(ChatService, chatService => {
        chatService.addTools(...tools);
        chatService.registerContextHandlers(contextHandlers);
      });

      app.waitForService(AgentLifecycleService, lifecycleService => lifecycleService.addHooks(hooks));
      app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
      app.addServices(new FileSystemService(config.filesystem));

      app.waitForService(RpcService, rpcService => {
        rpcService.registerEndpoint(filesystemRPC);
      });
    }
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;

import { AgentCommandService } from "@tokenring-ai/agent";
import filesystemRPC from "./rpc/filesystem.ts";
import TokenRingApp, { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { ScriptingService } from "@tokenring-ai/scripting";
import { ScriptingThis } from "@tokenring-ai/scripting/ScriptingService";
import {WebHostService} from "@tokenring-ai/web-host";
import JsonRpcResource from "@tokenring-ai/web-host/JsonRpcResource";

import chatCommands from "./chatCommands.ts";
import contextHandlers from "./contextHandlers.ts";
import FileSystemService from "./FileSystemService.js";
import packageJSON from "./package.json" with {type: "json"};
import tools from "./tools.ts";
import { FileSystemConfigSchema } from "./index.ts";


export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    const filesystemConfig = app.getConfigSlice("filesystem", FileSystemConfigSchema);
    if (filesystemConfig) {
      app.waitForService(ScriptingService, (scriptingService: ScriptingService) => {
        scriptingService.registerFunction("createFile", {
          type: 'native',
          params: ['path', 'content'],
          async execute(this: ScriptingThis, path: string, content: string): Promise<string> {
            await this.agent.requireServiceByType(FileSystemService).writeFile(path, content, this.agent);
            return `Created file: ${path}`;
          }
        }
        );

        scriptingService.registerFunction("deleteFile", {
          type: 'native',
          params: ['path'],
          async execute(this: ScriptingThis, path: string): Promise<string> {
            await this.agent.requireServiceByType(FileSystemService).deleteFile(path, this.agent);
            return `Deleted file: ${path}`;
          }
        }
        );

        scriptingService.registerFunction("globFiles", {
          type: 'native',
          params: ['pattern'],
          async execute(this: ScriptingThis, pattern: string): Promise<string[]> {
            return await this.agent.requireServiceByType(FileSystemService).glob(pattern, {}, this.agent);
          }
        }
        );

        scriptingService.registerFunction("searchFiles", {
          type: 'native',
          params: ['searchString'],
          async execute(this: ScriptingThis, searchString: string): Promise<string[]> {
            const results = await this.agent.requireServiceByType(FileSystemService).grep([searchString], {}, this.agent);
            return results.map(r => `${r.file}:${r.line}: ${r.match}`);
          }
        }
        );
      });
      app.waitForService(ChatService, chatService => {
        chatService.addTools(packageJSON.name, tools);
        chatService.registerContextHandlers(contextHandlers);
      });
      app.waitForService(AgentCommandService, agentCommandService =>
        agentCommandService.addAgentCommands(chatCommands)
      );
      app.addServices(new FileSystemService(filesystemConfig));

      app.waitForService(WebHostService, webHostService => {
        webHostService.registerResource("FileSystem RPC endpoint", new JsonRpcResource(app, filesystemRPC));
      });
    }
  }
} satisfies TokenRingPlugin;

import { AgentCommandService } from "@tokenring-ai/agent";
import filesystemRPC from "./rpc/filesystem.ts";
import TokenRingApp, { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { ScriptingService } from "@tokenring-ai/scripting";
import { ScriptingThis } from "@tokenring-ai/scripting/ScriptingService.ts";
import {WebHostService} from "@tokenring-ai/web-host";
import JsonRpcResource from "@tokenring-ai/web-host/JsonRpcResource";
import { z } from "zod";

import chatCommands from "./chatCommands.ts";
import contextHandlers from "./contextHandlers.ts";
import FileSystemService from "./FileSystemService.js";
import packageJSON from "./package.json" with {type: "json"};
import tools from "./tools.ts";

export const FileSystemConfigSchema = z.object({
  defaultProvider: z.string(),
  defaultSelectedFiles: z.array(z.string()).optional(),
  providers: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([
    "awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig",
    "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which"
  ]),
  dangerousCommands: z.array(z.string()).default([
    "rm ",
    ">",
    "tee",
    "reboot",
    "reset", // i.e. git reset
  ])
});

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
            await this.agent.requireServiceByType(FileSystemService).writeFile(path, content);
            return `Created file: ${path}`;
          }
        }
        );

        scriptingService.registerFunction("deleteFile", {
          type: 'native',
          params: ['path'],
          async execute(this: ScriptingThis, path: string): Promise<string> {
            await this.agent.requireServiceByType(FileSystemService).deleteFile(path);
            return `Deleted file: ${path}`;
          }
        }
        );

        scriptingService.registerFunction("globFiles", {
          type: 'native',
          params: ['pattern'],
          async execute(this: ScriptingThis, pattern: string): Promise<string[]> {
            return await this.agent.requireServiceByType(FileSystemService).glob(pattern);
          }
        }
        );

        scriptingService.registerFunction("searchFiles", {
          type: 'native',
          params: ['searchString'],
          async execute(this: ScriptingThis, searchString: string): Promise<string[]> {
            const results = await this.agent.requireServiceByType(FileSystemService).grep([searchString]);
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
  },
  start(app: TokenRingApp) {
    const filesystemConfig = app.getConfigSlice("filesystem", FileSystemConfigSchema);
    if (filesystemConfig?.defaultProvider) {
      app.requireService(FileSystemService).setActiveFileSystemProviderName(filesystemConfig.defaultProvider)
    }
  }
} as TokenRingPlugin;

export { default as FileMatchResource } from "./FileMatchResource.ts";
export { default as FileSystemService } from "./FileSystemService.ts";

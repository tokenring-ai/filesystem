import TokenRingApp from "@tokenring-ai/app"; 
import {AgentCommandService} from "@tokenring-ai/agent";
import {ChatService} from "@tokenring-ai/chat";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {ScriptingService} from "@tokenring-ai/scripting";
import {ScriptingThis} from "@tokenring-ai/scripting/ScriptingService.ts";
import {z} from "zod";

import * as chatCommands from "./chatCommands.ts";
import FileSystemService from "./FileSystemService.js";
import packageJSON from "./package.json" with {type: "json"};
import * as tools from "./tools.ts";

export const FileSystemConfigSchema = z.object({
  defaultProvider: z.string(),
  defaultSelectedFiles: z.array(z.string()).optional(),
  dangerousCommandPatterns: z.array(z.string()).optional(),
  providers: z.record(z.string(), z.any())
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
              const files = await this.agent.requireServiceByType(FileSystemService).glob(pattern);
              return files;
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
      app.waitForService(ChatService, chatService =>
        chatService.addTools(packageJSON.name, tools)
      );
      app.waitForService(AgentCommandService, agentCommandService =>
        agentCommandService.addAgentCommands(chatCommands)
      );
      app.addServices(new FileSystemService(filesystemConfig));
    }
  },
  start(app: TokenRingApp) {
    const filesystemConfig = app.getConfigSlice("filesystem", FileSystemConfigSchema);
    if (filesystemConfig?.defaultProvider) {
      app.requireService(FileSystemService).setActiveFileSystemProviderName(filesystemConfig.defaultProvider)
    }
  }
} as TokenRingPlugin;

export {default as FileMatchResource} from "./FileMatchResource.ts";
export {default as FileSystemService} from "./FileSystemService.ts";

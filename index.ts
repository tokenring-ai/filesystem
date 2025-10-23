import {AgentTeam, TokenRingPackage} from "@tokenring-ai/agent";
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
  install(agentTeam: AgentTeam) {
    const filesystemConfig = agentTeam.getConfigSlice("filesystem", FileSystemConfigSchema);
    if (filesystemConfig) {
      agentTeam.services.waitForItemByType(ScriptingService).then((scriptingService: ScriptingService) => {
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
      agentTeam.addTools(packageJSON.name, tools)
      agentTeam.addChatCommands(chatCommands);
      agentTeam.addServices(new FileSystemService(filesystemConfig));
    }
  },
  start(agentTeam: AgentTeam) {
    const filesystemConfig = agentTeam.getConfigSlice("filesystem", FileSystemConfigSchema);
    if (filesystemConfig?.defaultProvider) {
      agentTeam.services.requireItemByType(FileSystemService).setActiveFileSystemProviderName(filesystemConfig.defaultProvider)
    }
  }
} as TokenRingPackage;

export {default as FileMatchResource} from "./FileMatchResource.ts";
export {default as FileSystemService} from "./FileSystemService.ts";

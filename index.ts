import {AgentTeam, TokenRingPackage} from "@tokenring-ai/agent";
import {IterableService} from "@tokenring-ai/iterables";
import {z} from "zod";

import * as chatCommands from "./chatCommands.ts";
import FilesIterableProvider from "./FilesIterableProvider.js";
import FileSystemService from "./FileSystemService.js";
import GlobIterableProvider from "./GlobIterableProvider.js";
import LinesIterableProvider from "./LinesIterableProvider.js";
import packageJSON from "./package.json" with {type: "json"};
import * as tools from "./tools.ts";

export const FileSystemConfigSchema = z.object({
  defaultProvider: z.string(),
  defaultSelectedFiles: z.array(z.string()).optional(),
  dangerousCommandPatterns: z.array(z.string()).optional(),
  providers: z.record(z.string(), z.any())
});

export const packageInfo: TokenRingPackage = {
	name: packageJSON.name,
	version: packageJSON.version,
	description: packageJSON.description,
  install(agentTeam: AgentTeam) {
    const filesystemConfig = agentTeam.getConfigSlice("filesystem", FileSystemConfigSchema);
    if (filesystemConfig) {
      agentTeam.services.waitForItemByType(IterableService).then((iterableService: IterableService) => {
        iterableService.registerProvider("glob", new GlobIterableProvider());
        iterableService.registerProvider("files", new FilesIterableProvider());
        iterableService.registerProvider("lines", new LinesIterableProvider());
      });
      agentTeam.addTools(packageInfo, tools)
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
};

export { default as FileMatchResource } from "./FileMatchResource.ts";
export { default as FileSystemService } from "./FileSystemService.ts";

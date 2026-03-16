import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import FileSystemService from "../../FileSystemService.ts";
import {FileSystemState} from "../../state/fileSystemState.ts";

export default {
  name: "file default",
  description: "Reset to default files from config",
  help: `# /file default\n\nReset to default files from your configuration.\n\n## Example\n\n/file default`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const filesystem = agent.requireServiceByType(FileSystemService);
    const { initialConfig } = agent.getState(FileSystemState);
    await filesystem.setFilesInChat(initialConfig.selectedFiles, agent);
    return "Added default files to the chat session:\n" + markdownList(initialConfig.selectedFiles);
  },
} satisfies TokenRingAgentCommand;

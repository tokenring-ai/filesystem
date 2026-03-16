import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

export default {
  name: "file clear",
  description: "Remove all files from the chat session",
  help: `# /file clear\n\nRemove all files from the chat session.\n\n## Example\n\n/file clear`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const filesystem = agent.requireServiceByType(FileSystemService);
    await filesystem.setFilesInChat([], agent);
    return "Cleared all files from the chat session.";
  },
} satisfies TokenRingAgentCommand;

import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import numberedList from "@tokenring-ai/utility/string/numberedList";
import FileSystemService from "../../FileSystemService.ts";

export default {
  name: "file list",
  description: "/file list - List all files in the chat session",
  help: `# /file list\n\nList all files currently in the chat session.\n\n## Aliases\n\n/file ls\n\n## Example\n\n/file list`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const filesystem = agent.requireServiceByType(FileSystemService);
    const filesInChat = Array.from(filesystem.getFilesInChat(agent));
    if (filesInChat.length === 0) return "No files are currently in the chat session.";
    return "Files in chat session:\n" + numberedList(filesInChat);
  },
} satisfies TokenRingAgentCommand;

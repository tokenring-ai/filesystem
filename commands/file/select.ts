import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

export default {
  name: "file select",
  description: "/file select - Open interactive file selector",
  help: `# /file select\n\nOpen interactive file selector to choose files for the chat session.\n\n## Example\n\n/file select`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const filesystem = agent.requireServiceByType(FileSystemService);
    const selectedFiles = await agent.askQuestion({
      message: "Select a file or directory:",
      question: {
        type: 'fileSelect',
        label: "File Selection",
        defaultValue: Array.from(filesystem.getFilesInChat(agent)),
        allowDirectories: true,
        allowFiles: true,
      }
    });

    if (selectedFiles) {
      await filesystem.setFilesInChat(selectedFiles, agent);
      return `Selected ${selectedFiles.length} files for chat session`;
    }
    return "No files selected.";
  },
} satisfies TokenRingAgentCommand;

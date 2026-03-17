import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
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
}

export default {
  name: "file select",
  description: "Open interactive file selector",
  inputSchema,
  execute,
  help: `Open interactive file selector to choose files for the chat session.

## Example

/file select`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

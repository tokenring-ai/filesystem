import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import numberedList from "@tokenring-ai/utility/string/numberedList";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const filesInChat = filesystem.getFilesInChat(agent);
  if (filesInChat.empty()) return Promise.resolve("No files are currently in the chat session.");
  return Promise.resolve("Files in chat session:\n" + numberedList(filesInChat.valuesArray()));
}

export default {
  name: "file list",
  description: "List all files in the chat session",
  inputSchema,
  execute,
  help: `List all files currently in the chat session.

## Example

/file list`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

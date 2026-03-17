import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import numberedList from "@tokenring-ai/utility/string/numberedList";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const filesInChat = Array.from(filesystem.getFilesInChat(agent));
  if (filesInChat.length === 0) return "No files are currently in the chat session.";
  return "Files in chat session:\n" + numberedList(filesInChat);
}

export default {
  name: "file list",
  description: "List all files in the chat session",
  inputSchema,
  execute,
  help: `List all files currently in the chat session.

## Aliases

/file ls

## Example

/file list`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {
  args: {},
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  await filesystem.setFilesInChat([], agent);
  return "Cleared all files from the chat session.";
}

export default {
  name: "file clear",
  description: "Remove all files from the chat session",
  inputSchema,
  execute,
  help: `# /file clear

Remove all files from the chat session.

## Example

/file clear`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

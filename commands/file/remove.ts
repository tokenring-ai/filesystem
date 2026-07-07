import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {
  args: {},
  remainder: {
    name: "paths",
    description: "Space-separated file paths to remove",
    required: true,
  },
} as const satisfies AgentCommandInputSchema;

function execute({ remainder, agent }: AgentCommandInputType<typeof inputSchema>): string {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const filesToRemove = remainder.split(/\s+/);
  let removedCount = 0;

  for (const file of filesToRemove) {
    try {
      filesystem.removeFileFromChat(file, agent);
      removedCount++;
    } catch (err) {
      throw new CommandFailedError(`Failed to remove file ${file}`, { cause: err });
    }
  }

  if (removedCount > 0) {
    return `Successfully removed ${removedCount} file(s) from the chat session.`;
  }
  return "No files removed.";
}

export default {
  name: "file remove",
  description: "Remove files from the chat session",
  inputSchema,
  execute,
  help: `Remove specific files from the chat session.

## Example

/file remove src/main.ts`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

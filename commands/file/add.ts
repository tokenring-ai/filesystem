import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {
  args: {},
  remainder: {
    name: "paths",
    description: "Space-separated file paths to add",
    required: true,
  },
} as const satisfies AgentCommandInputSchema;

async function execute({ remainder, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const filesToAdd = remainder.split(/\s+/);
  let addedCount = 0;

  for (const file of filesToAdd) {
    try {
      await filesystem.addFileToChat(file, agent);
      addedCount++;
    } catch (err) {
      throw new CommandFailedError(`Failed to add file ${file}`, { cause: err });
    }
  }

  if (addedCount > 0) {
    return `Successfully added ${addedCount} file(s) to the chat session.`;
  }
  return "No files added.";
}

export default {
  name: "file add",
  description: "Add files to the chat session",
  inputSchema,
  execute,
  help: `Add specific files to the chat session.

## Example

/file add src/main.ts
/file add file1.txt file2.txt`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

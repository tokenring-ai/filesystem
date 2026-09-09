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
  const filesystem = agent.requireService(FileSystemService);
  const filesToAdd = remainder.split(/\s+/);
  let addedCount = 0;

  for (const file of filesToAdd) {
    try {
      // Relative arguments are probed across the allowed roots.
      const probed = await filesystem.probeMentionedPath(file, agent);
      if (!probed) throw new CommandFailedError(`Could not find ${file} in any allowed directory`);
      await filesystem.addFileToChat(probed, agent);
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

import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {
  args: {},
  remainder: {
    name: "paths",
    description: "Space-separated file paths to add",
    required: true,
  },
} as const satisfies AgentCommandInputSchema;

async function execute({
                         remainder,
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const filesToAdd = remainder.split(/\s+/);
  let addedCount = 0;
  const errors: string[] = [];

  for (const file of filesToAdd) {
    try {
      await filesystem.addFileToChat(file, agent);
      addedCount++;
    } catch (error) {
      errors.push(
        `Failed to add file ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (addedCount > 0) {
    const msg = `Successfully added ${addedCount} file(s) to the chat session.`;
    return errors.length > 0 ? msg + "\n" + errors.join("\n") : msg;
  }
  if (errors.length > 0) throw new CommandFailedError(errors.join("\n"));
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

import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

const inputSchema = {
  args: {},
  positionals: [{
    name: "paths",
    description: "Space-separated file paths to remove",
    required: true,
    greedy: true,
  }],
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({positionals: { paths }, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const filesToRemove = paths.split(/\s+/);
  let removedCount = 0;
  const errors: string[] = [];

  for (const file of filesToRemove) {
    try {
      filesystem.removeFileFromChat(file, agent);
      removedCount++;
    } catch (error) {
      errors.push(`Failed to remove file ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (removedCount > 0) {
    const msg = `Successfully removed ${removedCount} file(s) from the chat session.`;
    return errors.length > 0 ? msg + "\n" + errors.join("\n") : msg;
  }
  if (errors.length > 0) throw new CommandFailedError(errors.join("\n"));
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

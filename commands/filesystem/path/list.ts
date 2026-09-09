import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import FileSystemService from "../../../FileSystemService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const fileSystemService = agent.requireService(FileSystemService);
  const entries = fileSystemService.getAllowedPaths();
  if (entries.length === 0) return Promise.resolve("No allowed paths are configured.");
  return Promise.resolve(
    "Allowed paths:\n" +
      entries
        .map(
          entry => `- ${entry.path} (${entry.permission}${entry.provider ? `, ${entry.provider}` : ""})${entry.description ? ` — ${entry.description}` : ""}`,
        )
        .join("\n"),
  );
}

export default {
  name: "filesystem path list",
  description: "List the directories agents may access",
  inputSchema,
  execute,
  help: `List the allowed paths agents may access with the filesystem and terminal tools.

## Example

/filesystem path list`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "@tokenring-ai/agent/types";
import FileSystemService from "../../../FileSystemService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {
      name: "name",
      description: "The provider name to set",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

function execute({
                   positionals,
                   agent,
                 }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
  const providerName = positionals.name.trim();
  if (!providerName)
    throw new CommandFailedError("Usage: /filesystem provider set <name>");
  const available = fileSystemService.getFilesystemProviderNames();
  if (available.includes(providerName)) {
    fileSystemService.setActiveFileSystem(providerName, agent);
    return Promise.resolve(`Active provider set to: ${providerName}`);
  }
  return Promise.resolve(`Provider "${providerName}" not found. Available providers: ${available.join(", ")}`);
}

export default {
  name: "filesystem provider set",
  description: "Set the active filesystem provider",
  inputSchema,
  execute,
  help: `Set the active filesystem provider by name.\n\n## Example\n\n/filesystem provider set local`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

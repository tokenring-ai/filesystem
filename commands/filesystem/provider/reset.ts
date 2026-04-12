import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../../FileSystemService.ts";
import {FileSystemState} from "../../../state/fileSystemState.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

function execute({
                   agent,
                 }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const initialProvider =
    agent.getState(FileSystemState).initialConfig.provider;
  if (!initialProvider)
    throw new CommandFailedError("No initial provider configured");
  agent
    .requireServiceByType(FileSystemService)
    .setActiveFileSystem(initialProvider, agent);
  return Promise.resolve(`Provider reset to ${initialProvider}`);
}

export default {
  name: "filesystem provider reset",
  description: "Reset to initial filesystem provider",
  inputSchema,
  execute,
  help: `Reset the active filesystem provider to the initial configured value.\n\n## Example\n\n/filesystem provider reset`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

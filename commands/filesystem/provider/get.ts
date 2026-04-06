import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import {FileSystemState} from "../../../state/fileSystemState.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  return `Current provider: ${agent.getState(FileSystemState).providerName ?? "(none)"}`;
}

export default {
  name: "filesystem provider get",
  description: "Show current filesystem provider",
  inputSchema,
  execute,
  help: `Display the currently active filesystem provider.\n\n## Example\n\n/filesystem provider get`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import FileSystemService from "../../FileSystemService.ts";
import { FileSystemState } from "../../state/fileSystemState.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireService(FileSystemService);
  const { initialConfig } = agent.getState(FileSystemState);

  // Config entries may be written relative to an allowed root; probe them.
  const resolved: string[] = [];
  for (const file of initialConfig.selectedFiles) {
    const probed = await filesystem.probeMentionedPath(file, agent);
    if (probed) resolved.push(probed);
    else agent.warningMessage(`Default selected file not found in any allowed directory: ${file}`);
  }

  await filesystem.setFilesInChat(resolved, agent);
  return "Added default files to the chat session:\n" + markdownList(resolved);
}

export default {
  name: "file default",
  description: "Reset to default files from config",
  inputSchema,
  execute,
  help: `Reset to default files from your configuration.

## Example

/file default`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

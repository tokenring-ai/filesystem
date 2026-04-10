import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import FileSystemService from "../../FileSystemService.ts";
import {FileSystemState} from "../../state/fileSystemState.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);
  const {initialConfig} = agent.getState(FileSystemState);
  await filesystem.setFilesInChat(initialConfig.selectedFiles, agent);
  return (
    "Added default files to the chat session:\n" +
    markdownList(initialConfig.selectedFiles)
  );
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

import type { TreeLeaf } from "@tokenring-ai/agent/question";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import FileSystemService from "../../../FileSystemService.ts";
import { FileSystemState } from "../../../state/fileSystemState.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
  const available = fileSystemService.getFilesystemProviderNames();
  if (available.length === 0) return "No filesystem providers are registered.";
  if (available.length === 1) {
    fileSystemService.setActiveFileSystem(available[0], agent);
    return `Only one provider configured, auto-selecting: ${available[0]}`;
  }

  const activeProvider = agent.getState(FileSystemState).providerName;
  const tree: TreeLeaf[] = available.map((name: string) => ({
    name: `${name}${name === activeProvider ? " (current)" : ""}`,
    value: name,
  }));
  const selection = await agent.askQuestion({
    message: "Select an active filesystem provider",
    question: {
      type: "treeSelect",
      label: "Filesystem Provider Selection",
      key: "result",
      defaultValue: activeProvider ? [activeProvider] : undefined,
      minimumSelections: 1,
      maximumSelections: 1,
      tree,
    },
  });

  if (selection) {
    fileSystemService.setActiveFileSystem(selection[0], agent);
    return `Active provider set to: ${selection[0]}`;
  }

  return "Provider selection cancelled.";
}

export default {
  name: "filesystem provider select",
  description: "Interactively select a filesystem provider",
  inputSchema,
  execute,
  help: `Interactively select the active filesystem provider. Auto-selects if only one provider is configured.\n\n## Example\n\n/filesystem provider select`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

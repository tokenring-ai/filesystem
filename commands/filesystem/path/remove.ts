import path from "node:path";
import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { ConfigurationService } from "@tokenring-ai/app";
import FileSystemService from "../../../FileSystemService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {
      name: "path",
      description: "Absolute directory to remove from the allow-list",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const fileSystemService = agent.requireService(FileSystemService);
  const configService = agent.requireService(ConfigurationService);

  const normalized = path.resolve(args.path.trim());
  const current = fileSystemService.getConfiguredAllowedPaths();
  const allowedPaths = current.filter(entry => path.resolve(entry.path) !== normalized);
  if (allowedPaths.length === current.length) {
    throw new CommandFailedError(`${normalized} is not on the allow-list. Use /filesystem path list to see the configured paths.`);
  }

  const overrides = configService.getOverrides("workspace");
  const result = await configService.apply("workspace", {
    ...overrides,
    filesystem: {
      ...(overrides.filesystem as object | undefined),
      allowedPaths,
    },
  });
  if (!result.ok) {
    throw new CommandFailedError(`Failed to update allowed paths: ${result.issues.map(issue => issue.message).join("; ")}`);
  }
  return `Removed allowed path ${normalized}`;
}

export default {
  name: "filesystem path remove",
  description: "Remove a directory from the allow-list",
  inputSchema,
  execute,
  help: `Remove a directory from the allow-list (persisted in workspace config).

## Example

/filesystem path remove /home/user/notes`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

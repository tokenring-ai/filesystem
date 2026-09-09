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
      description: "Absolute directory to allow",
      required: true,
    },
    {
      name: "permission",
      description: "read or write (default write)",
      required: false,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const fileSystemService = agent.requireService(FileSystemService);
  const configService = agent.requireService(ConfigurationService);

  const target = args.path.trim();
  if (!path.isAbsolute(target)) throw new CommandFailedError("Usage: /filesystem path add <absolute-directory> [read|write]");
  const permission = (args.permission ?? "write").trim();
  if (permission !== "read" && permission !== "write") {
    throw new CommandFailedError(`Permission must be "read" or "write", got "${permission}"`);
  }

  const normalized = path.resolve(target);
  const allowedPaths = fileSystemService
    .getConfiguredAllowedPaths()
    .filter(entry => path.resolve(entry.path) !== normalized)
    .concat([{ path: normalized, permission }]);

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
  return `Added allowed path ${normalized} (${permission})`;
}

export default {
  name: "filesystem path add",
  description: "Allow agents to access a directory",
  inputSchema,
  execute,
  help: `Add an absolute directory to the allow-list (persisted in workspace config).

## Example

/filesystem path add /home/user/notes read`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;

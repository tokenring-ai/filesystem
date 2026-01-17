import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import type {ExecuteCommandResult} from "../FileSystemProvider.js";
import FileSystemService from "../FileSystemService.ts";

const name = "terminal_bash";

export async function execute(
  {
    command,
    timeoutSeconds = 60,
    workingDirectory,
  }: z.infer<typeof inputSchema>,
  agent: Agent,
): Promise<ExecuteCommandResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  // Validate command input
  if (!command) {
    // Throw error instead of returning and logging via agent.errorMessage
    throw new Error(`[${name}] command is required`);
  }

  if (timeoutSeconds > 90) {
    timeoutSeconds = 90;
  }

  const cmdString = (
    Array.isArray(command) ? command.join(" ") : command
  ).trim();
  if (!cmdString) {
    throw new Error(`[${name}] command is required`);
  }

  // Informational message using the tool name variable
  agent.infoMessage(
    `[${name}] Running shell command via ${fileSystem.name}: ${cmdString} (cwd=${workingDirectory} timeout=${timeoutSeconds}s)`,
  );

  const commandSafetyLevel = fileSystem.getCommandSafetyLevel(cmdString);
  // Check if command is safe, unknown, or dangerous and ask for confirmation
  if (commandSafetyLevel === "unknown") {
    const confirmed = await agent.askForConfirmation({
      message: `Execute potentially unsafe command: ${cmdString}?`,
      default: true,
      timeout: 10,
    });
    if (!confirmed) throw new Error("User did not approve command execution");
  } else if (commandSafetyLevel === "dangerous") {
    const confirmed = await agent.askForConfirmation({
      message: `Execute potentially dangerous command: ${cmdString}?`,
    })
    if (!confirmed) throw new Error("User did not approve command execution");
  }

  try {
    const result = await fileSystem.executeCommand(command, {
      timeoutSeconds,
      workingDirectory: workingDirectory ?? "./",
    }, agent);

    return result;
  } catch (err: unknown) {
    // Extract error message safely
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[${name}] ${message}`);
  }
}

const description =
  "Run a shell command using the specified file system. Output is truncated to reasonable size. WARNING: Use with caution. Not sandboxed!";

const inputSchema = z.object({
  command: z.string().describe("The shell command to execute."),
  timeoutSeconds: z
    .number()
    .int()
    .optional()
    .describe("Timeout for the command in seconds (default 60, max 600)"),
  workingDirectory: z
    .string()
    .optional()
    .describe("Working directory, relative to the file system root"),
});

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

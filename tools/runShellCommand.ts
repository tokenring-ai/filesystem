import Agent from "@tokenring-ai/agent/Agent";
import {z} from "zod";
import type {ExecuteCommandResult} from "../FileSystemProvider.js";
import FileSystemService from "../FileSystemService.ts";

// Export tool name with package prefix
export const name = "terminal/runShellCommand";

export async function execute(
  {
    command,
    timeoutSeconds = 60,
    workingDirectory,
  }: {
    command?: string | string[];
    timeoutSeconds?: number;
    workingDirectory?: string;
  },
  agent: Agent,
): Promise<ExecuteCommandResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  // Validate command input
  if (!command) {
    // Throw error instead of returning and logging via agent.errorLine
    throw new Error(`[${name}] command is required`);
  }

  const cmdString = (
    Array.isArray(command) ? command.join(" ") : command
  ).trim();
  if (!cmdString) {
    throw new Error(`[${name}] command is required`);
  }

  // Informational message using the tool name variable
  agent.infoLine(
    `[${name}] Running shell command via ${fileSystem.name}: ${cmdString} (cwd=${workingDirectory})`,
  );

  // Check if command is dangerous and ask for confirmation
  if (fileSystem.isDangerousCommand(cmdString)) {
    const confirmed = await agent.askHuman({
      type: "askForConfirmation",
      message: `Execute potentially dangerous command: ${cmdString}?`,
    });
    if (!confirmed) throw new Error("User did not approve command execution");
  }

  try {
    const result = await fileSystem.executeCommand(command, {
      timeoutSeconds,
      workingDirectory: workingDirectory ?? "./",
    });

    // Mark as dirty if successful (similar to the original implementation)
    if (result.ok) {
      fileSystem.setDirty(true);
    }

    return result;
  } catch (err: unknown) {
    // Extract error message safely
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[${name}] ${message}`);
  }
}

export const description =
  "Run a shell command using the specified file system. Output is truncated to reasonable size. WARNING: Use with caution. Not sandboxed!";

export const inputSchema = z.object({
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

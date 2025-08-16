import ChatService from "@token-ring/chat/ChatService";
import {z} from "zod";
import FileSystemService, {ExecuteCommandResult} from "../FileSystemService.ts";
import type {Registry} from "@token-ring/registry";

export async function execute(
  { command, timeoutSeconds = 60, env = {}, workingDirectory }: { command?: string | string[]; timeoutSeconds?: number; env?: Record<string, string>; workingDirectory?: string },
  registry: Registry,
): Promise<
    ExecuteCommandResult|{ error: string }
> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const fileSystem = registry.requireFirstServiceByType(FileSystemService);

  // Validate command input
  if (!command) {
    chatService.errorLine("[runShellCommand] command is required");
    return { error: "command is required" };
  }

  const cmdString = (Array.isArray(command) ? command.join(" ") : command).trim();
  if (!cmdString) {
    chatService.errorLine("[runShellCommand] command is required");
    return { error: "command is required" };
  }
  chatService.infoLine(
    `[runShellCommand] Running shell command via ${fileSystem.name}: ${cmdString} (cwd=${workingDirectory})`,
  );

  try {
    const result = await fileSystem.executeCommand(command, {
      timeoutSeconds,
      env,
      workingDirectory: workingDirectory ?? "./",
    });

    // Mark as dirty if successful (similar to the original implementation)
    if (result.ok) {
      fileSystem.setDirty(true);
    }

    return result;
  } catch (err: any) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "",
      error: err.message,
    };
  }
}

export const description =
  "Run a shell command using the specified file system. Output is truncated to reasonable size. WARNING: Use with caution. Not sandboxed!";

export const parameters = z.object({
  command: z.string().describe("The shell command to execute."),
  timeoutSeconds: z
    .number()
    .int()
    .optional()
    .describe("Timeout for the command in seconds (default 60, max 600)"),
  env: z
    .record(z.string())
    .optional()
    .describe("Environment variables as key/value pairs."),
  workingDirectory: z
    .string()
    .optional()
    .describe("Working directory, relative to the file system root"),
});

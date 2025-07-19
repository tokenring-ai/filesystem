import ChatService from "@token-ring/chat/ChatService";
import FileSystemService from "../FileSystemService.js";
import { z } from "zod";

/**
 * Runs a shell command in the source directory using the appropriate file system.
 * @param {object} args
 * @param {string} args.command - The shell command to run.
 * @param {number} [args.timeoutSeconds=60] - Optional command timeout.
 * @param {object} [args.env={}] - Environment variables, key/value pairs.
 * @param {string} [args.workingDirectory] - Optional working directory (relative to source).
 * @param {string} [args.fileSystemType] - Optional file system type to use ("local" or "ssh").
 * @param {TokenRingRegistry} registry - The package registry
 */
export default execute;
export async function execute({ command, timeoutSeconds = 60, env = {}, workingDirectory, fileSystemType }, registry) {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const fileSystem = registry.requireFirstServiceByType(FileSystemService);
  
  // Execute command using FileSystem
  if (!command) {
    chatService.errorLine("[runShellCommand] command is required");
    return { error: "command is required" };
  }
  
  chatService.infoLine(`[runShellCommand] Running shell command via ${fileSystem.name}: ${command} (cwd=${workingDirectory})`);
  
  try {
    const result = await fileSystem.executeCommand(command, {
      timeoutSeconds,
      env,
      workingDirectory: workingDirectory ?? "./"
    });
    
    // Mark as dirty if successful (similar to the original implementation)
    if (result.ok) {
     fileSystem.setDirty(true);
    }
    
    return result;
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "",
      error: err.message,
    };
  }
}

export const description = "Run a shell command using the specified file system. Output is truncated to reasonable size. WARNING: Use with caution. Not sandboxed!";

export const parameters = z.object({
  command: z.string().describe("The shell command to execute."),
  timeoutSeconds: z.number().int().optional().describe("Timeout for the command in seconds (default 60, max 600)"),
  env: z.record(z.string()).optional().describe("Environment variables as key/value pairs."),
  workingDirectory: z.string().optional().describe("Working directory, relative to the file system root"),
});

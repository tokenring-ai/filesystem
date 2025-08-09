// @ts-nocheck
import ChatService from "@token-ring/chat/ChatService";
import { z } from "zod";
import FileSystemService from "../FileSystemService.js";

/**
 * Executes a shell command in the source directory using the configured file system.
 *
 * This function provides a safe way to execute shell commands with configurable
 * timeout, environment variables, and working directory. It uses the underlying
 * file system's command execution capabilities.
 *
 * **Security Note**: Commands are executed with the same privileges as the
 * running process. Always validate and sanitize user input before execution.
 *
 * **Performance Note**: Commands are executed synchronously on the underlying
 * file system. Long-running commands may block other operations.
 *
 * **File System State**: Successful commands automatically mark the file system
 * as "dirty" to indicate changes may have occurred.
 *
 * @async
 * @function execute
 * @param {Object} args - The execution parameters
 * @param {string} args.command - The shell command to execute. Required. Must be non-empty.
 * @param {number} [args.timeoutSeconds=60] - Command timeout in seconds (1-600, default 60)
 * @param {Object.<string, string>} [args.env={}] - Environment variables as key/value pairs
 * @param {string} [args.workingDirectory="./"] - Working directory relative to source root
 * @param {TokenRingRegistry} registry - The package registry for service resolution
 * @returns {Promise<Object>} Command execution result
 * @returns {boolean} return.ok - Whether the command executed successfully (exit code 0)
 * @returns {number} return.exitCode - The command's exit code (0 for success, non-zero for failure)
 * @returns {string} return.stdout - Standard output from the command (may be truncated)
 * @returns {string} return.stderr - Standard error output from the command
 * @returns {string} [return.error] - Error message if execution failed or was rejected
 * @throws {Error} Throws if registry services cannot be resolved
 *
 * @example
 * // Basic command execution
 * const result = await execute({
 *   command: 'ls -la'
 * }, registry);
 * if (result.ok) {
 *   console.log('Files:', result.stdout);
 * }
 *
 * @example
 * // Command with timeout and environment variables
 * const result = await execute({
 *   command: 'npm test',
 *   timeoutSeconds: 120,
 *   env: { NODE_ENV: 'test', CI: 'true' },
 *   workingDirectory: 'packages/app'
 * }, registry);
 *
 * @example
 * // Handling command failures
 * const result = await execute({ command: 'git status' }, registry);
 * if (result.ok) {
 *   console.log('Output:', result.stdout);
 * } else {
 *   console.error('Command failed with exit code:', result.exitCode);
 *   console.error('Error output:', result.stderr || result.error);
 * }
 *
 * @example
 * // Using environment variables and custom working directory
 * const result = await execute({
 *   command: 'echo $GREETING from $PWD',
 *   env: { GREETING: 'Hello World' },
 *   workingDirectory: 'src'
 * }, registry);
 *
 * @example
 * // Handling timeout scenarios
 * const result = await execute({
 *   command: 'sleep 300',
 *   timeoutSeconds: 10
 * }, registry);
 * if (!result.ok && result.error?.includes('timeout')) {
 *   console.log('Command timed out');
 * }
 *
 * @example
 * // Complex command with pipes and redirection
 * const result = await execute({
 *   command: 'find . -name "*.js" | head -10',
 *   workingDirectory: 'src'
 * }, registry);
 *
 * @warning Commands are not sandboxed - use with caution in production environments
 * @warning Commands may modify the file system state
 * @warning Output may be truncated for very large responses
 * @warning Commands run with the same privileges as the running process
 * @since 1.0.0
 */
export default execute;
export async function execute(
	{ command, timeoutSeconds = 60, env = {}, workingDirectory },
	registry,
) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const fileSystem = registry.requireFirstServiceByType(FileSystemService);

	// Execute command using FileSystem
	if (!command) {
		chatService.errorLine("[runShellCommand] command is required");
		return { error: "command is required" };
	}

	chatService.infoLine(
		`[runShellCommand] Running shell command via ${fileSystem.name}: ${command} (cwd=${workingDirectory})`,
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execute } from "../tools/runShellCommand.js";

// Mock the required service modules
const mockExecuteCommand = vi.fn();
const mockSetDirty = vi.fn();
const mockInfoLine = vi.fn();
const mockErrorLine = vi.fn();

// Create a mock file system
const mockFileSystem = {
	name: "comprehensive-test-filesystem",
	executeCommand: mockExecuteCommand,
	setDirty: mockSetDirty,
};

// Create a mock chat service
const mockChatService = {
	infoLine: mockInfoLine,
	errorLine: mockErrorLine,
};

// Create a mock registry
const createMockRegistry = () => ({
	requireFirstServiceByType: vi.fn((serviceType) => {
		if (serviceType.name === "ChatService") return mockChatService;
		if (serviceType.name === "FileSystemService") return mockFileSystem;
		return null;
	}),
});

/**
 * Comprehensive integration tests for runShellCommand that cover:
 * - All parameter combinations
 * - Edge cases and error conditions
 * - Security considerations
 * - Performance characteristics
 * - File system state management
 */
describe("runShellCommand Comprehensive Integration Tests", () => {
	let registry;

	beforeEach(() => {
		vi.clearAllMocks();
		registry = createMockRegistry();
	});

	describe("Parameter Validation and Edge Cases", () => {
		it("should reject empty string command", async () => {
			const result = await execute({ command: "" }, registry);

			expect(result).toEqual({ error: "command is required" });
			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
			expect(mockFileSystem.executeCommand).not.toHaveBeenCalled();
		});

		it("should reject null command", async () => {
			const result = await execute({ command: null }, registry);

			expect(result).toEqual({ error: "command is required" });
			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
			expect(mockFileSystem.executeCommand).not.toHaveBeenCalled();
		});

		it("should reject undefined command", async () => {
			const result = await execute({ command: undefined }, registry);

			expect(result).toEqual({ error: "command is required" });
			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
			expect(mockFileSystem.executeCommand).not.toHaveBeenCalled();
		});

		it("should handle whitespace-only command", async () => {
			const result = await execute({ command: "   \t\n  " }, registry);

			expect(result).toEqual({ error: "command is required" });
			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
			expect(mockFileSystem.executeCommand).not.toHaveBeenCalled();
		});

		it("should handle boundary timeout values", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			// Test minimum timeout
			await execute({ command: "ls", timeoutSeconds: 1 }, registry);
			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("ls", {
				timeoutSeconds: 1,
				env: {},
				workingDirectory: "./",
			});

			// Test maximum timeout
			await execute({ command: "ls", timeoutSeconds: 600 }, registry);
			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("ls", {
				timeoutSeconds: 600,
				env: {},
				workingDirectory: "./",
			});
		});
	});

	describe("Environment Variables Edge Cases", () => {
		it("should handle empty environment object", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "echo test", env: {} }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("echo test", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});

		it("should handle null environment", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "echo test", env: null }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("echo test", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});

		it("should handle undefined environment", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "echo test", env: undefined }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("echo test", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});

		it("should handle complex environment variables", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const complexEnv = {
				NODE_ENV: "production",
				API_KEY: "secret123",
				CONFIG_PATH: "/app/config",
				DEBUG: "true",
				PORT: "3000",
			};

			await execute({ command: "node app.js", env: complexEnv }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
				"node app.js",
				{
					timeoutSeconds: 60,
					env: complexEnv,
					workingDirectory: "./",
				},
			);
		});

		it("should handle environment variables with special characters", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const specialEnv = {
				PATH: "/usr/local/bin:/usr/bin:/bin",
				HOME: "/home/user",
				USER: "test-user",
				SHELL: "/bin/bash",
			};

			await execute({ command: "env", env: specialEnv }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("env", {
				timeoutSeconds: 60,
				env: specialEnv,
				workingDirectory: "./",
			});
		});
	});

	describe("Working Directory Edge Cases", () => {
		it("should handle absolute working directory", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute(
				{ command: "ls", workingDirectory: "/absolute/path" },
				registry,
			);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("ls", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "/absolute/path",
			});
		});

		it("should handle deeply nested working directory", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute(
				{
					command: "pwd",
					workingDirectory: "src/components/buttons/primary",
				},
				registry,
			);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("pwd", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "src/components/buttons/primary",
			});
		});

		it("should handle working directory with special characters", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute(
				{ command: "ls", workingDirectory: "path with spaces" },
				registry,
			);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("ls", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "path with spaces",
			});
		});
	});

	describe("Error Handling and Recovery", () => {
		it("should handle file system service unavailable", async () => {
			const registryWithMissingService = {
				requireFirstServiceByType: vi.fn((serviceType) => {
					if (serviceType.name === "ChatService") return mockChatService;
					return null; // FileSystemService not available
				}),
			};

			await expect(
				execute({ command: "ls" }, registryWithMissingService),
			).rejects.toThrow();
		});

		it("should handle chat service unavailable", async () => {
			const registryWithMissingService = {
				requireFirstServiceByType: vi.fn((serviceType) => {
					if (serviceType.name === "FileSystemService") return mockFileSystem;
					return null; // ChatService not available
				}),
			};

			mockFileSystem.executeCommand.mockResolvedValue({
				ok: true,
				exitCode: 0,
				stdout: "",
				stderr: "",
			});

			await expect(
				execute({ command: "ls" }, registryWithMissingService),
			).rejects.toThrow();
		});

		it("should handle various error types from file system", async () => {
			const testCases = [
				{ error: new Error("Network timeout"), expected: "Network timeout" },
				{
					error: new Error("Permission denied"),
					expected: "Permission denied",
				},
				{
					error: new Error("Command not found: invalidcmd"),
					expected: "Command not found: invalidcmd",
				},
				{
					error: new Error("Disk quota exceeded"),
					expected: "Disk quota exceeded",
				},
			];

			for (const { error, expected } of testCases) {
				mockFileSystem.executeCommand.mockRejectedValue(error);

				const result = await execute({ command: "test" }, registry);

				expect(result).toEqual({
					ok: false,
					exitCode: 1,
					stdout: "",
					stderr: "",
					error: expected,
				});
				expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
			}
		});
	});

	describe("File System State Management", () => {
		it("should mark dirty on successful command execution", async () => {
			const mockResult = {
				ok: true,
				exitCode: 0,
				stdout: "success",
				stderr: "",
			};
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const result = await execute({ command: "echo success" }, registry);

			expect(result).toEqual(mockResult);
			expect(mockFileSystem.setDirty).toHaveBeenCalledWith(true);
		});

		it("should not mark dirty on failed command execution", async () => {
			const mockResult = {
				ok: false,
				exitCode: 1,
				stdout: "",
				stderr: "error",
			};
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const result = await execute({ command: "false" }, registry);

			expect(result).toEqual(mockResult);
			expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
		});

		it("should not mark dirty on exception", async () => {
			mockFileSystem.executeCommand.mockRejectedValue(
				new Error("Network error"),
			);

			const result = await execute({ command: "ls" }, registry);

			expect(result.ok).toBe(false);
			expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
		});

		it("should handle file system setDirty failures gracefully", async () => {
			const mockResult = {
				ok: true,
				exitCode: 0,
				stdout: "success",
				stderr: "",
			};
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);
			mockFileSystem.setDirty.mockRejectedValue(
				new Error("Failed to mark dirty"),
			);

			const result = await execute({ command: "echo test" }, registry);

			expect(result).toEqual(mockResult);
			expect(mockFileSystem.setDirty).toHaveBeenCalledWith(true);
		});
	});

	describe("Logging and Observability", () => {
		it("should log command execution with all parameters", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute(
				{
					command: "npm run build",
					timeoutSeconds: 120,
					env: { NODE_ENV: "production" },
					workingDirectory: "packages/app",
				},
				registry,
			);

			expect(mockChatService.infoLine).toHaveBeenCalledWith(
				"[runShellCommand] Running shell command via comprehensive-test-filesystem: npm run build (cwd=packages/app)",
			);
		});

		it("should log error for missing command", async () => {
			await execute({}, registry);

			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
		});

		it("should log command with minimal parameters", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "ls" }, registry);

			expect(mockChatService.infoLine).toHaveBeenCalledWith(
				"[runShellCommand] Running shell command via comprehensive-test-filesystem: ls (cwd=undefined)",
			);
		});
	});

	describe("Complex Command Scenarios", () => {
		it("should handle commands with special characters", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const commands = [
				'echo "Hello World"',
				"echo 'Single quotes'",
				"echo \"Mixed 'quotes' here\"",
				"ls -la | head -10",
				'find . -name "*.js" -type f',
				'grep -r "pattern" . || true',
			];

			for (const command of commands) {
				await execute({ command }, registry);
				expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(command, {
					timeoutSeconds: 60,
					env: {},
					workingDirectory: "./",
				});
				mockFileSystem.executeCommand.mockClear();
			}
		});

		it("should handle very long commands", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const longCommand =
				'find . -type f -name "*.js" -not -path "./node_modules/*" -exec grep -l "TODO" {} \\; | xargs sed -i.bak \'s/TODO/FIXME/g\'';

			await execute({ command: longCommand }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(longCommand, {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});
	});

	describe("Performance and Resource Limits", () => {
		it("should handle timeout edge cases", async () => {
			const mockResult = { ok: false, exitCode: 124, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "sleep 1", timeoutSeconds: 0.1 }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("sleep 1", {
				timeoutSeconds: 0.1,
				env: {},
				workingDirectory: "./",
			});
		});

		it("should handle large output scenarios", async () => {
			const largeOutput = "a".repeat(1000000); // 1MB of data
			const mockResult = {
				ok: true,
				exitCode: 0,
				stdout: largeOutput,
				stderr: "",
			};
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const result = await execute({ command: "cat large-file.txt" }, registry);

			expect(result.stdout).toBe(largeOutput);
			expect(result.ok).toBe(true);
		});
	});
});

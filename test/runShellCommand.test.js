import { describe, it, expect, vi, beforeEach } from "vitest";
import { execute } from "../tools/runShellCommand.js";

// Mock the required service modules
vi.mock("@token-ring/chat/ChatService", () => ({
	default: class ChatService {},
}));

vi.mock("../FileSystemService.js", () => ({
	default: class FileSystemService {},
}));

// Mock the registry and services
const mockChatService = {
	infoLine: vi.fn(),
	errorLine: vi.fn(),
};

const mockFileSystem = {
	name: "test-filesystem",
	executeCommand: vi.fn(),
	setDirty: vi.fn(),
};

// Create a mock registry that returns our services
const createMockRegistry = () => ({
	requireFirstServiceByType: vi.fn((serviceType) => {
		// Check the service type name or use string matching
		if (serviceType.name === "ChatService") return mockChatService;
		if (serviceType.name === "FileSystemService") return mockFileSystem;
		return null;
	}),
});

describe("runShellCommand Integration Tests", () => {
	let registry;

	beforeEach(() => {
		vi.clearAllMocks();
		registry = createMockRegistry();
	});

	describe("Basic Command Execution", () => {
		it("should execute a basic command successfully", async () => {
			const mockResult = {
				ok: true,
				exitCode: 0,
				stdout: "hello world",
				stderr: "",
			};

			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const result = await execute({ command: 'echo "hello world"' }, registry);

			expect(result).toEqual(mockResult);
			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
				'echo "hello world"',
				{
					timeoutSeconds: 60,
					env: {},
					workingDirectory: "./",
				},
			);
			expect(mockFileSystem.setDirty).toHaveBeenCalledWith(true);
		});

		it("should handle command failure gracefully", async () => {
			const mockResult = {
				ok: false,
				exitCode: 1,
				stdout: "",
				stderr: "Command not found",
			};

			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const result = await execute({ command: "invalid-command" }, registry);

			expect(result).toEqual(mockResult);
			expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
		});
	});

	describe("Parameter Validation", () => {
		it("should return error when command is missing", async () => {
			const result = await execute({}, registry);

			expect(result).toEqual({ error: "command is required" });
			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
			expect(mockFileSystem.executeCommand).not.toHaveBeenCalled();
		});

		it("should handle empty string command", async () => {
			const result = await execute({ command: "" }, registry);

			expect(result).toEqual({ error: "command is required" });
			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
		});
	});

	describe("Timeout Configuration", () => {
		it("should use custom timeout when provided", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "sleep 5", timeoutSeconds: 30 }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("sleep 5", {
				timeoutSeconds: 30,
				env: {},
				workingDirectory: "./",
			});
		});

		it("should use default timeout when not provided", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "ls" }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("ls", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});
	});

	describe("Environment Variables", () => {
		it("should pass environment variables correctly", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			const env = { NODE_ENV: "test", DEBUG: "true" };
			await execute({ command: "echo $NODE_ENV", env }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith(
				"echo $NODE_ENV",
				{
					timeoutSeconds: 60,
					env,
					workingDirectory: "./",
				},
			);
		});

		it("should use empty env object when not provided", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "pwd" }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("pwd", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});
	});

	describe("Working Directory", () => {
		it("should use custom working directory when provided", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute(
				{
					command: "ls -la",
					workingDirectory: "src/components",
				},
				registry,
			);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("ls -la", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "src/components",
			});
		});

		it("should default to ./ when working directory not provided", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "pwd" }, registry);

			expect(mockFileSystem.executeCommand).toHaveBeenCalledWith("pwd", {
				timeoutSeconds: 60,
				env: {},
				workingDirectory: "./",
			});
		});
	});

	describe("Error Handling", () => {
		it("should handle file system errors gracefully", async () => {
			const error = new Error("File system not accessible");
			mockFileSystem.executeCommand.mockRejectedValue(error);

			const result = await execute({ command: "ls" }, registry);

			expect(result).toEqual({
				ok: false,
				exitCode: 1,
				stdout: "",
				stderr: "",
				error: "File system not accessible",
			});
			expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
		});

		it("should handle network timeouts", async () => {
			const error = new Error("Command timed out after 30 seconds");
			mockFileSystem.executeCommand.mockRejectedValue(error);

			const result = await execute(
				{ command: "sleep 60", timeoutSeconds: 30 },
				registry,
			);

			expect(result.error).toBe("Command timed out after 30 seconds");
			expect(result.ok).toBe(false);
		});
	});

	describe("Logging", () => {
		it("should log command execution", async () => {
			const mockResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute(
				{
					command: "git status",
					workingDirectory: "src",
				},
				registry,
			);

			expect(mockChatService.infoLine).toHaveBeenCalledWith(
				"[runShellCommand] Running shell command via test-filesystem: git status (cwd=src)",
			);
		});

		it("should log error for missing command", async () => {
			await execute({}, registry);

			expect(mockChatService.errorLine).toHaveBeenCalledWith(
				"[runShellCommand] command is required",
			);
		});
	});

	describe("File System Dirty State", () => {
		it("should mark file system as dirty on successful command", async () => {
			const mockResult = {
				ok: true,
				exitCode: 0,
				stdout: "success",
				stderr: "",
			};
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "touch file.txt" }, registry);

			expect(mockFileSystem.setDirty).toHaveBeenCalledWith(true);
		});

		it("should not mark file system as dirty on failed command", async () => {
			const mockResult = {
				ok: false,
				exitCode: 1,
				stdout: "",
				stderr: "error",
			};
			mockFileSystem.executeCommand.mockResolvedValue(mockResult);

			await execute({ command: "invalid-command" }, registry);

			expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
		});

		it("should not mark file system as dirty on exception", async () => {
			mockFileSystem.executeCommand.mockRejectedValue(
				new Error("Network error"),
			);

			await execute({ command: "ls" }, registry);

			expect(mockFileSystem.setDirty).not.toHaveBeenCalled();
		});
	});
});

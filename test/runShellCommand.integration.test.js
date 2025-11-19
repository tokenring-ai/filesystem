import {beforeEach, describe, expect, it, vi} from "vitest";
import {execute} from "../tools/runShellCommand.js";

// Mock the required service modules for integration testing
const mockExecuteCommand = vi.fn();
const mockSetDirty = vi.fn();
const mockInfoLine = vi.fn();
const mockErrorLine = vi.fn();

// Create a mock file system that simulates real behavior
const mockFileSystem = {
 name: "integration-test-filesystem",
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
 * Integration tests for runShellCommand that test the complete flow
 * including error handling and edge cases.
 */
describe("runShellCommand Integration Tests", () => {
 let registry;

 beforeEach(() => {
  vi.clearAllMocks();
  registry = createMockRegistry();
 });

 describe("Integration Flow Tests", () => {
  it("should handle the complete success flow", async () => {
   const mockResult = {
    ok: true,
    exitCode: 0,
    stdout: "integration test output",
    stderr: "",
   };

   mockExecuteCommand.mockResolvedValue(mockResult);

   const result = await execute(
    {
     command: "git status",
     workingDirectory: "src",
     env: {NODE_ENV: "test"},
    },
    registry,
   );

   expect(result).toEqual(mockResult);
   expect(mockExecuteCommand).toHaveBeenCalledWith("git status", {
    timeoutSeconds: 60,
    env: {NODE_ENV: "test"},
    workingDirectory: "src",
   });
   expect(mockInfoLine).toHaveBeenCalledWith(
    "[runShellCommand] Running shell command via integration-test-filesystem: git status (cwd=src)",
   );
   expect(mockSetDirty).toHaveBeenCalledWith(true);
  });

  it("should handle timeout scenarios", async () => {
   const mockResult = {
    ok: false,
    exitCode: 124,
    stdout: "",
    stderr: "Command timed out",
   };

   mockExecuteCommand.mockResolvedValue(mockResult);

   const result = await execute(
    {command: "npm test", timeoutSeconds: 30},
    registry,
   );

   expect(result).toEqual(mockResult);
   expect(mockExecuteCommand).toHaveBeenCalledWith("npm test", {
    timeoutSeconds: 30,
    env: {},
    workingDirectory: "./",
   });
   expect(mockSetDirty).not.toHaveBeenCalled();
  });

  it("should handle file system errors gracefully", async () => {
   const error = new Error("File system not available");
   mockExecuteCommand.mockRejectedValue(error);

   const result = await execute({command: "ls -la"}, registry);

   expect(result).toEqual({
    ok: false,
    exitCode: 1,
    stdout: "",
    stderr: "",
    error: "File system not available",
   });
   expect(mockSetDirty).not.toHaveBeenCalled();
  });
 });

 describe("Parameter Edge Cases", () => {
  it("should handle empty environment variables", async () => {
   const mockResult = {ok: true, exitCode: 0, stdout: "", stderr: ""};
   mockExecuteCommand.mockResolvedValue(mockResult);

   await execute({command: "echo test", env: {}}, registry);

   expect(mockExecuteCommand).toHaveBeenCalledWith("echo test", {
    timeoutSeconds: 60,
    env: {},
    workingDirectory: "./",
   });
  });

  it("should handle null working directory", async () => {
   const mockResult = {ok: true, exitCode: 0, stdout: "", stderr: ""};
   mockExecuteCommand.mockResolvedValue(mockResult);

   await execute({command: "pwd", workingDirectory: null}, registry);

   expect(mockExecuteCommand).toHaveBeenCalledWith("pwd", {
    timeoutSeconds: 60,
    env: {},
    workingDirectory: "./",
   });
  });

  it("should handle custom timeout values", async () => {
   const mockResult = {ok: true, exitCode: 0, stdout: "", stderr: ""};
   mockExecuteCommand.mockResolvedValue(mockResult);

   await execute({command: "sleep 1", timeoutSeconds: 300}, registry);

   expect(mockExecuteCommand).toHaveBeenCalledWith("sleep 1", {
    timeoutSeconds: 300,
    env: {},
    workingDirectory: "./",
   });
  });
 });

 describe("Error Scenarios", () => {
  it("should handle network timeouts", async () => {
   const error = new Error("Command timed out after 30 seconds");
   mockExecuteCommand.mockRejectedValue(error);

   const result = await execute(
    {command: "npm install", timeoutSeconds: 30},
    registry,
   );

   expect(result.error).toBe("Command timed out after 30 seconds");
   expect(result.ok).toBe(false);
  });

  it("should handle permission errors", async () => {
   const error = new Error("Permission denied");
   mockExecuteCommand.mockRejectedValue(error);

   const result = await execute({command: "sudo ls"}, registry);

   expect(result.error).toBe("Permission denied");
   expect(result.ok).toBe(false);
  });

  it("should handle command not found errors", async () => {
   const error = new Error("Command not found: invalidcmd");
   mockExecuteCommand.mockRejectedValue(error);

   const result = await execute({command: "invalidcmd"}, registry);

   expect(result.error).toBe("Command not found: invalidcmd");
   expect(result.ok).toBe(false);
  });
 });

 describe("Logging Integration", () => {
  it("should log command execution with all parameters", async () => {
   const mockResult = {ok: true, exitCode: 0, stdout: "", stderr: ""};
   mockExecuteCommand.mockResolvedValue(mockResult);

   await execute(
    {
     command: "npm run build",
     timeoutSeconds: 120,
     env: {NODE_ENV: "production"},
     workingDirectory: "packages/app",
    },
    registry,
   );

   expect(mockInfoLine).toHaveBeenCalledWith(
    "[runShellCommand] Running shell command via integration-test-filesystem: npm run build (cwd=packages/app)",
   );
  });

  it("should log error for missing command", async () => {
   await execute({}, registry);

   expect(mockErrorLine).toHaveBeenCalledWith(
    "[runShellCommand] command is required",
   );
  });
 });

 describe("File System State Management", () => {
  it("should mark dirty only on successful execution", async () => {
   const successResult = {
    ok: true,
    exitCode: 0,
    stdout: "success",
    stderr: "",
   };
   const failureResult = {
    ok: false,
    exitCode: 1,
    stdout: "",
    stderr: "error",
   };

   mockExecuteCommand.mockResolvedValueOnce(successResult);
   await execute({command: "echo success"}, registry);
   expect(mockSetDirty).toHaveBeenCalledWith(true);

   mockSetDirty.mockClear();
   mockExecuteCommand.mockResolvedValueOnce(failureResult);
   await execute({command: "false"}, registry);
   expect(mockSetDirty).not.toHaveBeenCalled();
  });
 });
});

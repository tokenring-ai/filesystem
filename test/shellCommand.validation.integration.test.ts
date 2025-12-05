import {beforeEach, describe, expect, it, vi} from "vitest";
import {execute} from "../tools/runShellCommand.js";

/**
 * Integration tests for shell command validation
 * Tests the complete flow from shell command execution to security validation
 */

// Mock the required service modules
const mockExecuteCommand = vi.fn();
const mockSetDirty = vi.fn();
const mockInfoLine = vi.fn();
const mockErrorLine = vi.fn();

// Mock FileSystemService with validation capabilities
const createMockFileSystemService = () => ({
  name: "test-filesystem-with-validation",
  executeCommand: mockExecuteCommand,
  setDirty: mockSetDirty,
  isCommandAllowed: vi.fn((command: string) => {
    // Simulate the actual allowed commands from FileSystemService
    const allowedCommands = [
      'cd', 'ls', 'git', 'npm', 'yarn', 'bun', 'tsc', 'node', 'echo', 'cat',
      'grep', 'find', 'mkdir', 'touch', 'pwd', 'env', 'mkdir', 'cp', 'mv'
    ];
    return allowedCommands.includes(command);
  }),
  parseCompoundCommand: vi.fn((command: string) => {
    // Simulate the actual parseCompoundCommand method
    const separators = ["&&", "||", ";", "|", ">", ">>"];
    let commands = [command];
    
    for (const sep of separators) {
      const newCommands: string[] = [];
      for (const cmd of commands) {
        newCommands.push(...cmd.split(sep));
      }
      commands = newCommands;
    }
    
    const commandNames = commands
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0)
      .map(cmd => cmd.split(" ")[0]);
    
    return commandNames;
  }),
});

// Create a mock chat service
const mockChatService = {
  infoLine: mockInfoLine,
  errorLine: mockErrorLine,
};

// Create a mock registry
const createMockRegistry = () => ({
  requireFirstServiceByType: vi.fn((serviceType: any) => {
    if (serviceType.name === "ChatService") return mockChatService;
    if (serviceType.name === "FileSystemService") return createMockFileSystemService();
    return null;
  }),
});

describe("Shell Command Validation Integration", () => {
  let registry: any;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = createMockRegistry();
  });

  describe("Compound Command Security Validation", () => {
    it("should execute compound command when all commands are allowed", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "cd frontend/chat && bun add lucide-react"},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "cd frontend/chat && bun add lucide-react",
        expect.objectContaining({
          timeoutSeconds: 60,
          env: {},
          workingDirectory: "./",
        }),
      );
      expect(mockInfoLine).toHaveBeenCalledWith(
        expect.stringContaining("cd frontend/chat && bun add lucide-react"),
      );
      expect(mockSetDirty).toHaveBeenCalledWith(true);
    });

    it("should reject compound command with dangerous commands", async () => {
      const result = await execute(
        {command: "cd src && rm -rf node_modules"},
        registry,
      );

      expect(result).toContain("Command(s) 'rm' not allowed");
      expect(mockExecuteCommand).not.toHaveBeenCalled();
      expect(mockSetDirty).not.toHaveBeenCalled();
      expect(mockErrorLine).toHaveBeenCalledWith(
        expect.stringContaining("Command(s) 'rm' not allowed"),
      );
    });

    it("should handle npm install and build commands", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "build complete",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "npm install && npm run build"},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm install && npm run build",
        expect.any(Object),
      );
    });

    it("should reject command with sudo", async () => {
      const result = await execute(
        {command: "sudo apt-get update"},
        registry,
      );

      expect(result).toContain("Command(s) 'sudo' not allowed");
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("should handle git operations with npm", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "git status",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "git status && npm run lint"},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "git status && npm run lint",
        expect.any(Object),
      );
    });
  });

  describe("Complex Compound Commands", () => {
    it("should handle yarn test with OR operator", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "tests passed",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "yarn test || npm test"},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "yarn test || npm test",
        expect.any(Object),
      );
    });

    it("should handle multiple separators", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "npm install; yarn build && tsc && echo \"done\""},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm install; yarn build && tsc && echo \"done\"",
        expect.any(Object),
      );
    });

    it("should handle pipe operator", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "filtered results",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "ls -la | grep test"},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "ls -la | grep test",
        expect.any(Object),
      );
    });

    it("should handle output redirection", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: "echo 'output' > output.txt"},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "echo 'output' > output.txt",
        expect.any(Object),
      );
    });
  });

  describe("Security Boundary Conditions", () => {
    it("should reject commands with dangerous patterns", async () => {
      const dangerousCommands = [
        "rm -rf /",
        "sudo rm -rf /",
        "format c:",
        "del /s /q *.*",
        "shutdown -h now",
        "reboot",
        "chmod -R 777 /",
        "dd if=/dev/zero of=/dev/sda",
      ];

      for (const command of dangerousCommands) {
        const result = await execute({command: command}, registry);
        expect(result).toContain("not allowed");
        expect(mockExecuteCommand).not.toHaveBeenCalled();
      }
    });

    it("should handle mixed safe and dangerous commands", async () => {
      const result = await execute(
        {command: "cd src && npm install && rm -rf node_modules"},
        registry,
      );

      expect(result).toContain("not allowed");
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("should handle commands with special characters and quotes", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {command: 'echo "Hello World" && echo \'Single Quotes\' && echo Mix\\"ed'},
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'echo "Hello World" && echo \'Single Quotes\' && echo Mix\\"ed',
        expect.any(Object),
      );
    });
  });

  describe("Real-world Development Scenarios", () => {
    it("should handle typical development workflow", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "development complete",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const developmentCommands = [
        "cd frontend/chat",
        "npm install",
        "npm run build",
        "npm run lint && npm run test",
        "git status && git add .",
      ];

      for (const command of developmentCommands) {
        const result = await execute({command}, registry);
        expect(result).toEqual(mockResult);
        expect(mockExecuteCommand).toHaveBeenCalledWith(command, expect.any(Object));
      }
    });

    it("should handle bun package manager operations", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "package installed",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const bunCommands = [
        "bun add lucide-react",
        "bun install",
        "bun run dev",
        "bun test",
        "cd frontend && bun add lucide-react && bun run build",
      ];

      for (const command of bunCommands) {
        const result = await execute({command}, registry);
        expect(result).toEqual(mockResult);
        expect(mockExecuteCommand).toHaveBeenCalledWith(command, expect.any(Object));
      }
    });

    it("should handle TypeScript compilation workflows", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "compilation successful",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const typescriptCommands = [
        "tsc",
        "tsc --project tsconfig.json",
        "tsc && npm run build",
        "tsc --watch & npm run dev",
      ];

      for (const command of typescriptCommands) {
        const result = await execute({command}, registry);
        expect(result).toEqual(mockResult);
        expect(mockExecuteCommand).toHaveBeenCalledWith(command, expect.any(Object));
      }
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle empty compound command", async () => {
      const result = await execute({command: ""}, registry);

      expect(result).toEqual("Error: command is required");
      expect(mockChatService.errorLine).toHaveBeenCalledWith(
        "[runShellCommand] command is required",
      );
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("should handle command with only separators", async () => {
      const result = await execute({command: "&& || ; | > >>"}, registry);

      expect(result).toContain("not allowed");
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("should handle malformed compound commands", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const malformedCommands = [
        "npm install &&",
        "&& npm install",
        "npm &&",
        "&&",
      ];

      for (const command of malformedCommands) {
        const result = await execute({command}, registry);
        // These should either be rejected or handled gracefully
        if (result !== mockResult) {
          expect(typeof result).toBe("string");
        }
      }
    });

    it("should handle very long compound commands", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const longCommand = "npm install && npm run build && npm run test && npm run lint && npm run type-check";

      const result = await execute({command: longCommand}, registry);

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(longCommand, expect.any(Object));
    });
  });

  describe("Performance and Resource Management", () => {
    it("should handle commands with many parts efficiently", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const manyPartsCommand = "cd src && npm install && npm run build && npm run test && npm run lint && tsc && echo 'done'";

      const result = await execute({command: manyPartsCommand}, registry);

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(manyPartsCommand, expect.any(Object));
    });

    it("should not execute when any command is dangerous", async () => {
      const dangerousCommand = "npm install && npm run build && rm -rf dist && npm run deploy";

      const result = await execute({command: dangerousCommand}, registry);

      expect(result).toContain("not allowed");
      expect(mockExecuteCommand).not.toHaveBeenCalled();
      expect(mockSetDirty).not.toHaveBeenCalled();
    });

    it("should handle timeout configuration with validation", async () => {
      const mockResult = {
        ok: true,
        exitCode: 0,
        stdout: "success",
        stderr: "",
      };
      mockExecuteCommand.mockResolvedValue(mockResult);

      const result = await execute(
        {
          command: "npm install && npm run build",
          timeoutSeconds: 300,
          env: {NODE_ENV: "production"},
          workingDirectory: "packages/app",
        },
        registry,
      );

      expect(result).toEqual(mockResult);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "npm install && npm run build",
        expect.objectContaining({
          timeoutSeconds: 300,
          env: {NODE_ENV: "production"},
          workingDirectory: "packages/app",
        }),
      );
    });
  });
});
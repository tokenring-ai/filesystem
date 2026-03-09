import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import FileSystemService from "../../FileSystemService.ts";

export default {
  name: "file remove",
  description: "/file remove [files...] - Remove files from the chat session",
  help: `# /file remove\n\nRemove specific files from the chat session.\n\n## Aliases\n\n/file rm\n\n## Example\n\n/file remove src/main.ts`,
  execute: async (remainder: string, agent: Agent): Promise<string> => {
    const filesystem = agent.requireServiceByType(FileSystemService);
    const filesToRemove = remainder ? remainder.trim().split(/\s+/) : [];
    let removedCount = 0;
    const errors: string[] = [];

    for (const file of filesToRemove) {
      try {
        filesystem.removeFileFromChat(file, agent);
        removedCount++;
      } catch (error) {
        errors.push(`Failed to remove file ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (removedCount > 0) {
      const msg = `Successfully removed ${removedCount} file(s) from the chat session.`;
      return errors.length > 0 ? msg + "\n" + errors.join("\n") : msg;
    }
    if (errors.length > 0) throw new CommandFailedError(errors.join("\n"));
    return "No files removed.";
  },
} satisfies TokenRingAgentCommand;

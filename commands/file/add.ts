import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../../FileSystemService.ts";

export default {
  name: "file add",
  description: "Add files to the chat session",
  help: `# /file add\n\nAdd specific files to the chat session.\n\n## Example\n\n/file add src/main.ts\n/file add file1.txt file2.txt`,
  execute: async (remainder: string, agent: Agent): Promise<string> => {
    const filesystem = agent.requireServiceByType(FileSystemService);
    const filesToAdd = remainder ? remainder.trim().split(/\s+/) : [];
    let addedCount = 0;
    const errors: string[] = [];

    for (const file of filesToAdd) {
      try {
        await filesystem.addFileToChat(file, agent);
        addedCount++;
      } catch (error) {
        errors.push(`Failed to add file ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (addedCount > 0) {
      const msg = `Successfully added ${addedCount} file(s) to the chat session.`;
      return errors.length > 0 ? msg + "\n" + errors.join("\n") : msg;
    }
    if (errors.length > 0) throw new CommandFailedError(errors.join("\n"));
    return "No files added.";
  },
} satisfies TokenRingAgentCommand;

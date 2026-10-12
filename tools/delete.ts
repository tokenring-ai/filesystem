import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import requireAbsolutePath from "../util/requireAbsolutePath.ts";

const name = "file_delete";
const displayName = "Filesystem/delete";

/** Permanent deletion is in the data-loss band. */
const DELETE_SAFETY_LEVEL = 8;

async function execute({ path: rawPath }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const chatService = agent.requireService(ChatService);
  const filePath = requireAbsolutePath(name, rawPath);

  if (!(await fileSystem.exists(filePath, agent))) {
    return {
      failed: true,
      message: `**File Delete** File not found: ${filePath}`,
      result: `Cannot delete ${filePath}: the file does not exist.`,
    };
  }

  const confirmed = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Permanently delete ${filePath}?`,
      detailedDescription: "The file is removed immediately; this action cannot be undone.",
      safetyLevel: DELETE_SAFETY_LEVEL,
      default: false,
    },
    agent,
  );
  if (!confirmed) {
    return {
      failed: true,
      message: `**File Delete** Not approved: ${filePath}`,
      result: `User did not approve deleting ${filePath}.`,
    };
  }

  const deleted = await fileSystem.deleteFile(filePath, agent);
  if (!deleted) {
    return {
      failed: true,
      message: `**File Delete** Could not delete ${filePath}`,
      result: `Deleting ${filePath} failed.`,
    };
  }

  agent.mutateState(FileSystemState, (state: FileSystemState) => {
    state.readFiles.delete(filePath);
    state.selectedFiles.delete(filePath);
  });

  return {
    message: `**File Delete** Deleted ${filePath}`,
    result: `Deleted ${filePath}. This action is permanent.`,
  };
}

const description = `
Permanently deletes a file. This cannot be undone.
- The path must be absolute and inside an allowed directory.
- Directories cannot be deleted with this tool; delete the files inside first.
`.trim();

const inputSchema = z.object({
  path: z.string().describe("Absolute path of the file to delete (e.g., '/project/src/old.ts'). Must be inside an allowed directory."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  adjustActivation: (enabled: boolean, agent: Agent) => enabled && agent.getState(FileSystemState).settings.fileDelete.enabled,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

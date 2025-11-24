import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../FileSystemService.ts";

/**
 * /file [action] [files...] - Manage files in the chat session
 *
 * Actions:
 * - add [files...]: Add files to the chat session (interactive if no files specified)
 * - remove [files...]: Remove files from the chat session (interactive if no files specified)
 * - list: List all files currently in the chat session
 * - clear: Remove all files from the chat session
 * - default: Reset to default files from config
 */

const description: string =
  "/file [action] [files...] - Manage files in the chat session (select, add, remove, list, clear, defaults).";

// Updated function signatures to use concrete types instead of `any`
async function selectFiles(filesystem: FileSystemService, agent: Agent) {
  const selectedFiles = await filesystem.askForFileSelection(
    {
      initialSelection: Array.from(filesystem.getFilesInChat(agent)),
    },
    agent,
  );
  if (selectedFiles) {
    filesystem.setFilesInChat(selectedFiles, agent);
    agent.infoLine(`Selected ${selectedFiles.length} files for chat session`);
  }
}

async function addFiles(
  filesystem: FileSystemService,
  agent: Agent,
  filesToAdd: string[],
) {
  let addedCount = 0;
  for (const file of filesToAdd) {
    try {
      await filesystem.addFileToChat(file, agent);
      agent.infoLine(`Added file to chat: ${file}`);
      addedCount++;
    } catch (error) {
      agent.errorLine(`Failed to add file ${file}:`, error as Error);
    }
  }

  if (addedCount > 0) {
    agent.infoLine(
      `Successfully added ${addedCount} file(s) to the chat session.`,
    );
  }
}

async function removeFiles(
  filesystem: FileSystemService,
  agent: Agent,
  filesToRemove: string[],
) {
  let removedCount = 0;
  for (const file of filesToRemove) {
    try {
      filesystem.removeFileFromChat(file, agent);
      agent.infoLine(`Removed file from chat: ${file}`);
      removedCount++;
    } catch (error) {
      agent.errorLine(`Failed to remove file ${file}:`, error as Error);
    }
  }

  if (removedCount > 0) {
    agent.infoLine(
      `Successfully removed ${removedCount} file(s) from the chat session.`,
    );
  }
}

async function listFiles(filesystem: FileSystemService, agent: Agent) {
  const filesInChat: string[] = Array.from(filesystem.getFilesInChat(agent));

  if (!filesInChat || filesInChat.length === 0) {
    agent.infoLine("No files are currently in the chat session.");
    return;
  }

  agent.infoLine(`Files in chat session:`);
  filesInChat.forEach((file: string, index: number) => {
    agent.infoLine(`  ${index + 1}. ${file}`);
  });
}

async function clearFiles(filesystem: FileSystemService, agent: Agent) {
  await filesystem.setFilesInChat([], agent);
  agent.infoLine("Cleared all files from the chat session.");
}

async function defaultFiles(filesystem: FileSystemService, agent: Agent) {
  const defaultFiles: string[] = filesystem.getDefaultFiles();

  await filesystem.setFilesInChat(defaultFiles, agent);
  agent.infoLine(`Added default files to the chat session:`);
  defaultFiles.forEach((file: string, index: number) => {
    agent.infoLine(`  ${index + 1}. ${file}`);
  });
}

/**
 * Returns help information for the file command
 */
// noinspection JSUnusedGlobalSymbols
function help(): Array<string> {
  return [
    "/file [action] [files...] - Manage files in the chat session",
    "  Actions:",
    "    select             - Interactive file selection",
    "    add [files...]     - Add files to chat session",
    "    remove [files...]  - Remove files from chat session",
    "    list               - List files in chat session",
    "    clear              - Remove all files from chat session",
    "    default            - Reset selected files to your config default",
    "",
    "  Examples:",
    "    /file select            - Interactive file selection",
    "    /file add src/index.js  - Add specific file",
    "    /file remove index.js   - Remove specific files",
    "    /file list              - Show current files",
  ];
}

async function execute(remainder: string, agent: Agent) {
  const filesystem = agent.requireServiceByType(FileSystemService);

  const args = remainder ? remainder.trim().split(/\s+/) : [];
  const action = args[0];

  const actionArgs = args.slice(1);

  switch (action) {
    case "select":
      await selectFiles(filesystem, agent);
      break;

    case "add":
      await addFiles(filesystem, agent, actionArgs);
      break;

    case "remove":
    case "rm":
      await removeFiles(filesystem, agent, actionArgs);
      break;

    case "list":
    case "ls":
      await listFiles(filesystem, agent);
      break;

    case "clear":
      await clearFiles(filesystem, agent);
      break;

    case "default":
      await defaultFiles(filesystem, agent);
      break;

    default:
      const helpLines = help();
      helpLines.forEach((line) => agent.infoLine(line));
      break;
  }
}

export default {
  description,
  execute,
  help,
} as TokenRingAgentCommand
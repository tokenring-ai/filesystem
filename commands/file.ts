import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

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
  "/file - Manage files in the chat session (select, add, remove, list, clear, defaults).";

// Updated function signatures to use concrete types instead of `any`
async function selectFiles(filesystem: FileSystemService, agent: Agent) {
  const selectedFiles = await filesystem.askForFileSelection(
    {
      initialSelection: Array.from(filesystem.getFilesInChat(agent)),
      allowDirectories: true
    },
    agent,
  );
  if (selectedFiles) {
    await filesystem.setFilesInChat(selectedFiles, agent);
    agent.infoLine(`Selected ${selectedFiles.length} files for chat session`);
  } else {
    agent.infoLine("No files selected.");
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
  const { initialConfig } = agent.getState(FileSystemState);

  await filesystem.setFilesInChat(initialConfig.selectedFiles, agent);
  agent.infoLine(`Added default files to the chat session:`);
  for (const file of initialConfig.selectedFiles) {
    agent.infoLine(`  ${file}`);
  }
}

/**
 * Returns help information for the file command
 */
const help: string = `# 📁 FILE MANAGEMENT COMMAND

## Usage

/file [action] [files...]

Manage files in your chat session with various actions to add, remove, list, or clear files. The file system tracks which files are included in your current chat context.

## Available Actions

- **select** - Open interactive file selector to choose files
- **add [files...]** - Add specific files to chat session
- **remove [files...]** - Remove specific files from chat session
- **list (or ls)** - Show all files currently in chat session
- **clear** - Remove all files from chat session
- **default** - Reset to default files from your configuration

## Action Aliases

- **ls** - Alias for 'list' action
- **rm** - Alias for 'remove' action

## Usage Examples

/file select                    # Interactive file selection
/file add src/main.ts           # Add a specific file
/file add src/*.ts              # Add all TypeScript files
/file add file1.txt file2.txt   # Add multiple files
/file remove src/main.ts        # Remove a specific file
/file rm old-file.js            # Remove using alias
/file list                      # Show current files
/file ls                        # Show current files (alias)
/file clear                     # Remove all files
/file default                   # Reset to config defaults

## Notes

- Use 'select' for a visual file picker when you're unsure which files to add
- File paths are relative to your current working directory
- Wildcard patterns (like *.ts) are supported for adding multiple files
- The 'default' action restores your configured default file set
- Use 'list' to verify which files are currently in your chat context`;

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
      agent.chatOutput(help);
      break;
  }
}

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand
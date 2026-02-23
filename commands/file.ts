import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import numberedList from "@tokenring-ai/utility/string/numberedList";
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
async function selectFiles(filesystem: FileSystemService, agent: Agent): Promise<string> {
  const selectedFiles = await agent.askQuestion({
    message: "Select a file or directory:",
    question: {
      type: 'fileSelect',
      label: "File Selection",
      defaultValue: Array.from(filesystem.getFilesInChat(agent)),
      allowDirectories: true,
      allowFiles: true,
    }
  });

  if (selectedFiles) {
    await filesystem.setFilesInChat(selectedFiles, agent);
    return `Selected ${selectedFiles.length} files for chat session`;
  } else {
    return "No files selected.";
  }
}

async function addFiles(
  filesystem: FileSystemService,
  agent: Agent,
  filesToAdd: string[],
): Promise<string> {
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
    if (errors.length > 0) {
      return msg + "\n" + errors.join("\n");
    }
    return msg;
  }
  
  if (errors.length > 0) {
    throw new CommandFailedError(errors.join("\n"));
  }
  
  return "No files added.";
}

async function removeFiles(
  filesystem: FileSystemService,
  agent: Agent,
  filesToRemove: string[],
): Promise<string> {
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
    if (errors.length > 0) {
      return msg + "\n" + errors.join("\n");
    }
    return msg;
  }
  
  if (errors.length > 0) {
    throw new CommandFailedError(errors.join("\n"));
  }
  
  return "No files removed.";
}

async function listFiles(filesystem: FileSystemService, agent: Agent): Promise<string> {
  const filesInChat: string[] = Array.from(filesystem.getFilesInChat(agent));

  if (!filesInChat || filesInChat.length === 0) {
    return "No files are currently in the chat session.";
  }

  const lines: string[] = [
    "Files in chat session:",
    numberedList(filesInChat)
  ];
  return lines.join("\n");
}

async function clearFiles(filesystem: FileSystemService, agent: Agent): Promise<string> {
  await filesystem.setFilesInChat([], agent);
  return "Cleared all files from the chat session.";
}

async function defaultFiles(filesystem: FileSystemService, agent: Agent): Promise<string> {
  const { initialConfig } = agent.getState(FileSystemState);

  await filesystem.setFilesInChat(initialConfig.selectedFiles, agent);
  const lines: string[] = [
    "Added default files to the chat session:",
    markdownList(initialConfig.selectedFiles)
  ];
  return lines.join("\n");
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

async function execute(remainder: string, agent: Agent): Promise<string> {
  const filesystem = agent.requireServiceByType(FileSystemService);

  const args = remainder ? remainder.trim().split(/\s+/) : [];
  const action = args[0];

  const actionArgs = args.slice(1);

  switch (action) {
    case "select":
      return await selectFiles(filesystem, agent);

    case "add":
      return await addFiles(filesystem, agent, actionArgs);

    case "remove":
    case "rm":
      return await removeFiles(filesystem, agent, actionArgs);

    case "list":
    case "ls":
      return await listFiles(filesystem, agent);

    case "clear":
      return await clearFiles(filesystem, agent);

    case "default":
      return await defaultFiles(filesystem, agent);

    default:
      return help;
  }
}

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand

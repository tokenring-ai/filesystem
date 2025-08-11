import { HumanInterfaceService } from "@token-ring/chat";
import ChatService from "@token-ring/chat/ChatService";
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

export const description: string =
  "/file [action] [files...] - Manage files in the chat session (select, add, remove, list, clear, defaults).";

async function selectFiles(filesystem: any, chatService: any, humanInterfaceService: any) {
  try {
    const selectedFiles = await humanInterfaceService.askForFileSelection(
      filesystem,
      {
        initialSelection: Array.from(filesystem.getFilesInChat()),
      },
    );

    filesystem.setFilesInChat(selectedFiles);
    chatService.systemLine(
      `Selected ${selectedFiles.length} files for chat session`,
    );
  } catch (error) {
    chatService.errorLine("Error during file selection:", error);
  }
}

async function addFiles(
  filesystem: any,
  chatService: any,
  _humanInterfaceService: any,
  filesToAdd: string[],
) {
  let addedCount = 0;
  for (const file of filesToAdd) {
    try {
      await filesystem.addFileToChat(file);
      chatService.systemLine(`Added file to chat: ${file}`);
      addedCount++;
    } catch (error) {
      chatService.errorLine(`Failed to add file ${file}:`, error);
    }
  }

  if (addedCount > 0) {
    chatService.systemLine(
      `Successfully added ${addedCount} file(s) to the chat session.`,
    );
  }
}

async function removeFiles(
  filesystem: any,
  chatService: any,
  _humanInterfaceService: any,
  filesToRemove: string[],
) {
  let removedCount = 0;
  for (const file of filesToRemove) {
    try {
      await filesystem.removeFileFromChat(file);
      chatService.systemLine(`Removed file from chat: ${file}`);
      removedCount++;
    } catch (error) {
      chatService.errorLine(`Failed to remove file ${file}:`, error);
    }
  }

  if (removedCount > 0) {
    chatService.systemLine(
      `Successfully removed ${removedCount} file(s) from the chat session.`,
    );
  }
}

async function listFiles(filesystem: any, chatService: any) {
  const filesInChat: string[] = Array.from(await filesystem.getFilesInChat());

  if (!filesInChat || filesInChat.length === 0) {
    chatService.systemLine("No files are currently in the chat session.");
    return;
  }

  chatService.systemLine(`Files in chat session:`);
  filesInChat.forEach((file: string, index: number) => {
    chatService.systemLine(`  ${index + 1}. ${file}`);
  });
}

async function clearFiles(filesystem: any, chatService: any) {
  await filesystem.setFilesInChat([]);
  chatService.systemLine("Cleared all files from the chat session.");
}

async function defaultFiles(filesystem: any, chatService: any) {
  const defaultFiles: string[] = filesystem.getDefaultFiles();

  await filesystem.setFilesInChat(defaultFiles);
  chatService.systemLine(`Added default files to the chat session:`);
  defaultFiles.forEach((file: string, index: number) => {
    chatService.systemLine(`  ${index + 1}. ${file}`);
  });
}

export async function execute(remainder: string, registry: any) {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const humanInterfaceService = registry.requireFirstServiceByType(
    HumanInterfaceService,
  );
  const filesystem = registry.requireFirstServiceByType(FileSystemService);

  const args = remainder ? remainder.trim().split(/\s+/) : [];
  const action = args[0];

  const actionArgs = args.slice(1);

  switch (action) {
    case "select":
      await selectFiles(filesystem, chatService, humanInterfaceService);
      break;

    case "add":
      await addFiles(
        filesystem,
        chatService,
        humanInterfaceService,
        actionArgs,
      );
      break;

    case "remove":
    case "rm":
      await removeFiles(
        filesystem,
        chatService,
        humanInterfaceService,
        actionArgs,
      );
      break;

    case "list":
    case "ls":
      await listFiles(filesystem, chatService);
      break;

    case "clear":
      await clearFiles(filesystem, chatService);
      break;

    case "default":
      await defaultFiles(filesystem, chatService);
      break;

    default:
      chatService.systemLine("File management commands:");
      chatService.systemLine(
        "  /file select             - Interactive file selection",
      );
      chatService.systemLine(
        "  /file add [files...]     - Add files to chat session",
      );
      chatService.systemLine(
        "  /file remove [files...]  - Remove files from chat session",
      );
      chatService.systemLine(
        "  /file list               - List files in chat session",
      );
      chatService.systemLine(
        "  /file clear              - Remove all files from chat session",
      );
      chatService.systemLine(
        "  /file default            - Reset selected files to your config default",
      );
      chatService.systemLine("");
      chatService.systemLine("Examples:");
      chatService.systemLine(
        "  /file select " + "" + "            - Interactive file selection",
      );
      chatService.systemLine("  /file add src/index.js   - Add specific file");
      chatService.systemLine(
        "  /file remove index.js    - Remove specific files",
      );
      chatService.systemLine("  /file list               - Show current files");
      break;
  }
}

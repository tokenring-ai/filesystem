import ChatService from "@token-ring/chat/ChatService";
import path from "path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import type {Registry} from "@token-ring/registry";

export async function execute(
  {
    path: filePath,
    action,
    content,
    permissions,
    owner,
    toPath,
    fileSystemType,
  }: {
    path?: string;
    action?: "create" | "replace" | "delete" | "rename" | "adjust";
    content?: string;
    permissions?: number | string;
    owner?: string;
    toPath?: string;
    fileSystemType?: string;
  },
  registry: Registry,
): Promise<string| { error: string }> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const fileSystem = registry.requireFirstServiceByType(FileSystemService);

  chatService.infoLine(
    `[fileManager] Performing ${action} operation via ${fileSystem.name}: ${filePath}`,
  );

  if (!filePath) {
      chatService.errorLine(`[fileManager] Error: 'path' parameter is required`);
      return { error: "'path' parameter is required" };
  }

  try {
    switch (action) {
      case "create":
      case "replace": {
        if (!content) {
          return { error: "Content is required when creating a file" };
        }

        // Ensure parent directory exists
        const dirPath = path.dirname(filePath);
        if (dirPath !== "." && dirPath !== "/") {
          await fileSystem.createDirectory(dirPath, { recursive: true });
        }

        // Create or update the file
        const success = await fileSystem.writeFile(filePath, content);

        // Update file permissions if needed and if the implementation supports it
        if (permissions) {
          const numericPermissions =
            typeof permissions === "string" ? Number.parseInt(permissions, 8) : permissions;
          await fileSystem.chmod(filePath, numericPermissions);
        }

        if (success) {
          fileSystem.setDirty(true);
        }

        return `File successfully ${action === "create" ? "created" : "updated"}`;
      }
      case "delete": {
        // Check if file exists
        const fileExists = await fileSystem.exists(filePath);
        if (!fileExists) {
          chatService.infoLine(`[fileManager] Cannot delete file ${filePath}: file not found.`);
          return { error: `Cannot delete file ${filePath}: file not found.` };
        }

        // Delete the file
        const deleteSuccess = await fileSystem.deleteFile(filePath);

        if (deleteSuccess) {
          fileSystem.setDirty(true);
        }

        return "File successfully deleted";
      }
      case "rename": {
        if (!toPath) {
          return { error: "'toPath' parameter is required for rename operations" };
        }

        // Check if source file exists
        const sourceExists = await fileSystem.exists(filePath);
        if (!sourceExists) {
          chatService.errorLine(`[fileManager] Cannot rename file ${filePath}: file not found.`);
          return { error: `Cannot rename file ${filePath}: file not found.` };
        }

        // Ensure destination directory exists
        const destDir = path.dirname(toPath);
        if (destDir !== "." && destDir !== "/") {
          await fileSystem.createDirectory(destDir, { recursive: true });
        }

        // Rename the file
        const renameSuccess = await fileSystem.rename(filePath, toPath);

        if (renameSuccess) {
          fileSystem.setDirty(true);
        }

        return "File successfully renamed";
      }
      case "adjust": {
        // Check if file exists
        const adjustExists = await fileSystem.exists(filePath);
        if (!adjustExists) {
          chatService.errorLine(
            `[fileManager] Cannot modify permissions for file ${filePath}: file not found.`,
          );
          return { error: "File not found" };
        }

        let modified = false;

        // Update permissions if needed
        if (permissions) {
          const numericPermissions =
            typeof permissions === "string" ? Number.parseInt(permissions, 8) : permissions;
          const chmodSuccess = await fileSystem.chmod(filePath, numericPermissions);
          if (chmodSuccess) {
            modified = true;
          }
        }

        if (modified) {
          fileSystem.setDirty(true);
          return "File properties successfully adjusted";
        } else {
          return "No changes were made to the file";
        }
      }
      default:
        return { error: `Unsupported action '${action}'. Supported actions are: create, update, delete, rename, adjust` };
    }
  } catch (err: any) {
    chatService.errorLine(`[fileManager] Error: ${err.message}`);
    return { error: `Error performing ${action} operation: ${err.message}` };
  }
}

export const description =
  "Creating, updating, deleting, and rename files, and adjust file properties.";

export const parameters = z.object({
  path: z
    .string()
    .describe("Path of the file to operate on. Will be created if it doesn't exist."),
  action: z
    .enum(["create", "replace", "delete", "rename", "adjust"]) // NOTE: keep "replace" for bw compat
    .describe("The action to perform on the file."),
  content: z
    .string()
    .describe(
      "Full text content when creating or updating a file. ALWAYS include the ENTIRE file contents. It is an absolutely critical failure to not output the entire file.",
    )
    .optional(),
  permissions: z
    .string()
    .describe(
      "File permissions string (e.g., '644' or '0o644') to set. Parsed as octal. Default: '644' (if not provided, no changes are made by default for 'adjust' action, sensible defaults for 'create').",
    )
    .optional(),
  owner: z
    .string()
    .describe("Owner of the file. Default: current user.")
    .optional(),
  toPath: z
    .string()
    .describe(
      "New path/name for the file when renaming. Will create missing directories if needed.",
    )
    .optional(),
});

import path from "path-browserify";
import FileSystemService from "../FileSystemService.js";
import ChatService from "@token-ring/chat/ChatService";
import { z } from "zod";

/**
 * Unified file management tool that combines create, update, delete, rename, and permissions adjustment
 * operations in a single interface.
 *
 * @param {Object} params - Parameters for the file operation.
 * @param {string} params.path - Path of the file to operate on, relative to the source directory.
 * @param {string} params.action - The action to perform: 'create', 'update', 'delete', 'rename', or 'adjust'.
 * @param {string} [params.content] - Full text content when creating or updating a file.
 * @param {number} [params.permissions=0o644] - File permissions mode (octal) to set.
 * @param {string} [params.owner] - Owner of the file (if supported by the filesystem).
 * @param {string} [params.toPath] - New path/name for the file when renaming.
 * @param {TokenRingRegistry} registry - The package registry
 * @returns {Promise<string>} - A message indicating the result of the operation.
 */
export async function execute(
	{
		path: filePath,
		action,
		content,
		permissions,
		owner,
		toPath,
		fileSystemType,
	},
	registry,
) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const fileSystem = registry.requireFirstServiceByType(FileSystemService);

	chatService.infoLine(
		`[fileManager] Performing ${action} operation via ${fileSystem.name}: ${filePath}`,
	);

	try {
		switch (action) {
			case "create":
			case "replace": {
				if (!content) {
					return "Error: Content is required when creating a file";
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
						typeof permissions === "string"
							? parseInt(permissions, 8)
							: permissions;
					await fileSystem.chmod(filePath, numericPermissions);
				}

				// Update owner if specified and supported
				if (owner && typeof fileSystem.chown === "function") {
					await fileSystem.chown(filePath, owner);
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
					chatService.infoLine(
						`Cannot delete file ${filePath}: file not found.`,
					);
					return `Cannot delete file ${filePath}: file not found. Can you check the spelling and try again?`;
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
					return "Error: 'toPath' parameter is required for rename operations";
				}

				// Check if source file exists
				const sourceExists = await fileSystem.exists(filePath);
				if (!sourceExists) {
					chatService.errorLine(
						`Cannot rename file ${filePath}: file not found.`,
					);
					return `Cannot rename file ${filePath}: file not found. Can you check the spelling and try again?`;
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
						`Cannot modify permissions for file ${filePath}: file not found.`,
					);
					return `Error: File not found`;
				}

				let modified = false;

				// Update permissions if needed
				if (permissions) {
					const numericPermissions =
						typeof permissions === "string"
							? parseInt(permissions, 8)
							: permissions;
					const chmodSuccess = await fileSystem.chmod(
						filePath,
						numericPermissions,
					);
					if (chmodSuccess) {
						modified = true;
					}
				}

				// Update owner if specified and supported
				if (owner) {
					const chownSuccess = await fileSystem.chown(filePath, owner);
					if (chownSuccess) {
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
				return `Error: Unsupported action '${action}'. Supported actions are: create, update, delete, rename, adjust`;
		}
	} catch (err) {
		chatService.errorLine(`[fileManager] Error: ${err.message}`);
		return `Error performing ${action} operation: ${err.message}`;
	}
}

export const description =
	"Creating, updating, deleting, and rename files, and adjust file properties.";

export const parameters = z.object({
	path: z
		.string()
		.describe(
			"Path of the file to operate on. Will be created if it doesn't exist.",
		),
	action: z
		.enum(["create", "replace", "delete", "rename", "adjust"])
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

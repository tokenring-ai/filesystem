import Agent from "@tokenring-ai/agent/Agent";
import path from "path";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";

// Tool name export as required
export const name = "file/modify";

export async function execute(
	{
		path: filePath,
		action,
		content,
		is_base64,
		fail_if_exists,
		permissions,
		toPath,
		check_exists,
	}: {
		path?: string;
		action?: "write" | "append" | "delete" | "rename" | "adjust";
		content?: string;
		is_base64?: boolean;
		fail_if_exists?: boolean;
		permissions?: string;
		toPath?: string;
		check_exists?: boolean;
	},
	agent: Agent,
): Promise<string> {
	const fileSystem = agent.requireServiceByType(FileSystemService);

	if (!filePath) {
		throw new Error(`[${name}] 'path' parameter is required for all actions`);
	}
	if (!action) {
		throw new Error(`[${name}] 'action' parameter is required for all actions`);
	}

	// Informational messages use the tool name
	agent.infoLine(
		`[${name}] Performing ${action} operation via ${fileSystem.name}: ${filePath}`,
	);

	// Normalize permissions early if provided
	let numericPermissions: number | undefined;
	if (permissions !== undefined) {
		numericPermissions = Number.parseInt(permissions, 8);
		if (
			isNaN(numericPermissions) ||
			numericPermissions < 0 ||
			numericPermissions > 0o777
		) {
			throw new Error(
				`[${name}] Invalid permissions: must be a valid octal number between 0 and 777`,
			);
		}
		numericPermissions |= 0o600;
	}

	switch (action) {
		case "write":
		case "append": {
			if (!content) {
				throw new Error(
					`[${name}] 'content' is required for ${action} actions`,
				);
			}

			// Check existence if needed
			const fileExists = await fileSystem.exists(filePath);
			if (action === "write" && fail_if_exists && fileExists) {
				throw new Error(
					`[${name}] File ${filePath} already exists and 'fail_if_exists' is true`,
				);
			}

			// Ensure parent directory exists
			const dirPath = path.dirname(filePath);
			if (dirPath !== "." && dirPath !== "/") {
				await fileSystem.createDirectory(dirPath, { recursive: true });
			}

			// Handle content: decode if base64
			let finalContent: string | Buffer;
			if (is_base64) {
				finalContent = Buffer.from(content, "base64");
			} else {
				finalContent = content;
			}

			// Confirm overwrite if file exists
			if (action === "write" && fileExists) {
				const confirmed = await agent.askHuman({
					type: "askForConfirmation",
					message: `Overwrite ${filePath}?`,
				});
				if (!confirmed) throw new Error("User did not approve overwrite");
			}

			// Write or append
			let success: boolean;
			if (action === "write") {
				success = await fileSystem.writeFile(filePath, finalContent);
			} else {
				// append
				success = await fileSystem.appendFile(filePath, finalContent);
			}

			// Set permissions if provided, or default for new files
			if (success && !fileExists) {
				// Only default for truly new files
				const permsToSet = numericPermissions ?? 0o644;
				await fileSystem.chmod(filePath, permsToSet);
			} else if (numericPermissions !== undefined) {
				await fileSystem.chmod(filePath, numericPermissions);
			}

			if (success) {
				fileSystem.setDirty(true);
			}

			return `File successfully ${action === "write" ? (fileExists ? "overwritten" : "created") : "appended to"}`;
		}
		case "delete": {
			const fileExists = await fileSystem.exists(filePath);
			if (!fileExists && check_exists) {
				// Default to error if missing
				throw new Error(
					`[${name}] Cannot delete file ${filePath}: file not found`,
				);
			}
			if (fileExists) {
				const confirmed = await agent.askHuman({
					type: "askForConfirmation",
					message: `Delete ${filePath}?`,
				});
				if (!confirmed) throw new Error("User did not approve deletion");

				const success = await fileSystem.deleteFile(filePath);
				if (success) {
					fileSystem.setDirty(true);
					return "File successfully deleted";
				} else {
					return "File not found, no action taken"; // If check_exists false
				}
			}
			return "File not found, no action taken";
		}
		case "rename": {
			if (!toPath) {
				throw new Error(
					`[${name}] 'toPath' parameter is required for rename action`,
				);
			}

			const sourceExists = await fileSystem.exists(filePath);
			if (!sourceExists && check_exists) {
				throw new Error(
					`[${name}] Cannot rename file ${filePath}: file not found`,
				);
			}
			if (!sourceExists) {
				return "File not found, no action taken";
			}

			// Ensure destination directory exists
			const destDir = path.dirname(toPath);
			if (destDir !== "." && destDir !== "/") {
				await fileSystem.createDirectory(destDir, { recursive: true });
			}

			// Confirm if destination exists
			const destExists = await fileSystem.exists(toPath);
			if (destExists) {
				const confirmed = await agent.askHuman({
					type: "askForConfirmation",
					message: `Rename ${filePath} to ${toPath} (destination exists)?`,
				});
				if (!confirmed) throw new Error("User did not approve rename");
			}

			const success = await fileSystem.rename(filePath, toPath);
			if (success) {
				fileSystem.setDirty(true);
			}

			return "File successfully renamed";
		}
		case "adjust": {
			const fileExists = await fileSystem.exists(filePath);
			if (!fileExists && check_exists) {
				throw new Error(
					`[${name}] Cannot adjust file ${filePath}: file not found`,
				);
			}
			if (!fileExists) {
				return "File not found, no action taken";
			}

			let modified = false;

			if (numericPermissions !== undefined) {
				const success = await fileSystem.chmod(filePath, numericPermissions);
				if (success) {
					modified = true;
				}
			}

			// Future: Add other properties here if supported (e.g., chown, utimes)

			if (modified) {
				fileSystem.setDirty(true);
				return "File properties successfully adjusted";
			} else {
				return "No changes applied to the file";
			}
		}
		default:
			throw new Error(
				`[${name}] Unsupported action '${action}'. Supported actions: write, append, delete, rename, adjust`,
			);
	}
}

export const description =
	"Manage files in a virtual filesystem: write (create/overwrite), append, delete, rename, or adjust properties (currently permissions only). Paths are relative to the virtual root (e.g., './file.txt' or '/docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8) or base64-encoded binary. Always provide entire content for 'write'; partial for 'append'.";

export const inputSchema = z.object({
	path: z
		.string()
		.describe(
			"Relative path of the file to operate on (e.g., 'src/main.ts' or '/docs/design.md'). Starts from virtual FS root. Required.",
		),
	action: z
		.enum(["write", "append", "delete", "rename", "adjust"])
		.describe(
			"Action to perform: 'write' creates/overwrites with full content; 'append' adds to end; 'delete' removes; 'rename' moves/renames; 'adjust' changes properties.",
		),
	content: z
		.string()
		.describe(
			"Content for 'write' or 'append'. For 'write', ALWAYS include ENTIRE file contents to avoid data loss. For binary, use base64 and set 'is_base64'. Optional for non-content actions.",
		)
		.optional(),
	is_base64: z
		.boolean()
		.describe(
			"If true, 'content' is base64-encoded binary data (decoded before writing). Default: false (treat as UTF-8 text).",
		)
		.optional(),
	fail_if_exists: z
		.boolean()
		.describe(
			"For 'write' only: If true, error if file already exists (strict create). Default: false (allow overwrite).",
		)
		.optional(),
	permissions: z
		.string()
		.describe(
			"Permissions as octal string (e.g. '644'). For 'write'/'append' on new files: default 0o644 if not provided.",
		)
		.optional(),
	toPath: z
		.string()
		.describe(
			"New relative path for 'rename' (e.g., 'new/src/main.ts'). Creates missing directories. Required for 'rename'.",
		)
		.optional(),
	check_exists: z
		.boolean()
		.describe(
			"For 'delete', 'rename', 'adjust': If true (default), error if file not found. If false, return 'no action taken' silently.",
		)
		.optional(),
});

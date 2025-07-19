import ChatService from "@token-ring/chat/ChatService";
import FileSystemService from "../FileSystemService.js";
import { z } from "zod";

export async function execute(
	{ file, startRegex, endRegex, replacement },
	registry,
) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const fileSystem = registry.requireFirstServiceByType(FileSystemService);

	try {
		// Read the original file content
		const originalContent = await fileSystem.getFile(file);

		// Create a regex pattern that matches from startRegex to endRegex
		const pattern = new RegExp(`(${startRegex})[\\s\\S]*?(${endRegex})`, "gm");

		// Check if the pattern matches anything in the file
		if (!pattern.test(originalContent)) {
			throw new Error(
				`Could not find a match for the provided regex patterns in file ${file}`,
			);
		}

		// Reset the regex lastIndex
		pattern.lastIndex = 0;

		// Replace the matched content with the replacement
		const patchedContent = originalContent.replace(
			pattern,
			`$1\n${replacement}\n$2`,
		);

		// Write the patched content back to the file
		await fileSystem.writeFile(file, patchedContent);

		chatService.infoLine(`Patched file: ${file}`);
		fileSystem.setDirty(true);

		return `Successfully patched file ${file} using regex pattern`;
	} catch (error) {
		chatService.errorLine(`Failed to patch file ${file}: ${error.message}`);
		throw error;
	}
}

export const description =
	"Patches a file using regular expressions to match the beginning and end of a code block to replace.";

export const parameters = z.object({
	file: z
		.string()
		.describe("Path to the file to patch, relative to the source directory."),
	startRegex: z
		.string()
		.describe(
			"Regular expression to match the beginning of the code block to replace.",
		),
	endRegex: z
		.string()
		.describe(
			"Regular expression to match the end of the code block to replace.",
		),
	replacement: z
		.string()
		.describe(
			"The code that will replace the matched block between startRegex and endRegex.",
		),
});

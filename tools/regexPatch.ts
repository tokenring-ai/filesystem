import ChatService from "@token-ring/chat/ChatService";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import type {Registry} from "@token-ring/registry";

/**
 * Executes a regex based patch on a file.
 * All informational messages are prefixed with the tool name `[regexPatch]`.
 * Errors are returned as an object `{ error: string }` rather than throwing.
 */
export async function execute(
    { file, startRegex, endRegex, replacement }: {
        file: string;
        startRegex: string;
        endRegex: string;
        replacement: string;
    },
    registry: Registry,
): Promise<string | { error: string }> {
    const chatService = registry.requireFirstServiceByType(ChatService);
    const fileSystem = registry.requireFirstServiceByType(FileSystemService);

    try {
        // Read the original file content
        const originalContent = await fileSystem.getFile(file);

        if (! originalContent) {
            const msg = `Failed to read file content: ${file}`;
            chatService.errorLine(`[regexPatch] ${msg}`);
            return { error: msg };
        }

        // Create a regex pattern that matches from startRegex to endRegex
        const pattern = new RegExp(`(${startRegex})[\\s\\S]*?(${endRegex})`, "gm");


        // Check if the pattern matches anything in the file
        if (!pattern.test(originalContent)) {
            const msg = `Could not find a match for the provided regex patterns in file ${file}`;
            chatService.errorLine(`[regexPatch] ${msg}`);
            return { error: msg };
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

        chatService.infoLine(`[regexPatch] Patched file: ${file}`);
        fileSystem.setDirty(true);

        // Return a plain success string without tool name prefix
        return `Successfully patched file ${file} using regex pattern`;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        chatService.errorLine(`[regexPatch] Failed to patch file ${file}: ${errMsg}`);
        return { error: errMsg };
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

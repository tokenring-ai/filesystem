import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

/**
 * Executes a regex based patch on a file.
 * All informational messages are prefixed with the tool name `[regexPatch]`.
 * Errors are thrown as exceptions with the tool name prefix.
 */
const name = "file/regexPatch";
const toolName = name.split("/")[1]; // "regexPatch"

async function execute(
  {
    file,
    startRegex,
    endRegex,
    replacement,
  }: z.infer<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  // Read the original file content
  const originalContent = await fileSystem.getFile(file);

  if (!originalContent) {
    const msg = `Failed to read file content: ${file}`;
    agent.errorLine(`[${toolName}] ${msg}`);
    throw new Error(`[${toolName}] ${msg}`);
  }

  // Create a regex pattern that matches from startRegex to endRegex
  const pattern = new RegExp(`(${startRegex})[\\s\\S]*?(${endRegex})`, "gm");

  // Check if the pattern matches anything in the file
  if (!pattern.test(originalContent)) {
    const msg = `Could not find a match for the provided regex patterns in file ${file}`;
    agent.errorLine(`[${toolName}] ${msg}`);
    throw new Error(`[${toolName}] ${msg}`);
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

  agent.infoLine(`[${toolName}] Patched file: ${file}`);
  fileSystem.setDirty(true);

  // Return a plain success string without tool name prefix
  return `Successfully patched file ${file} using regex pattern`;
}

const description =
  "Patches a file using regular expressions to match the beginning and end of a code block to replace.";

const inputSchema = z.object({
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

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

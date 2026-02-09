import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition, type TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {createPatch} from "diff";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

// Exported name for the tool
const name = "file_patch";
const displayName = "Filesystem/patch";

async function execute(
  {
    file,
    firstLineToMatchAndRemove,
    lastLineToMatchAndRemove,
    replacementContent,
  }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  // Read the original file content
  const originalContent = await fileSystem.readTextFile(file, agent);
  if (!originalContent) {
    throw new Error(`[${name}] Failed to read file content: ${file}`);
  }
  const lines = originalContent.split("\n");

  // Normalize whitespace for comparison
  const normalizeWhitespace = (line: string) => line.trim();
  const normalizedFirstLine = normalizeWhitespace(firstLineToMatchAndRemove);
  const normalizedLastLine = normalizeWhitespace(lastLineToMatchAndRemove);

  // Find all matches for firstLineToMatchAndRemove
  const firstLineMatches: number[] = [];
  lines.forEach((line, index) => {
    if (normalizeWhitespace(line) === normalizedFirstLine) {
      firstLineMatches.push(index);
    }
  });

  // Ensure exactly one firstLineToMatchAndRemove match
  if (firstLineMatches.length === 0) {
    throw new Error(
      `[${name}] Could not find the line "${firstLineToMatchAndRemove}" in file ${file}`,
    );
  }
  if (firstLineMatches.length > 1) {
    throw new Error(
      `[${name}] Found ${firstLineMatches.length} matches for line "${firstLineToMatchAndRemove}" in file ${file}. Expected exactly one match.`,
    );
  }

  const fromLineIndex = firstLineMatches[0];

  // Find the first occurrence of lastLineToMatchAndRemove starting from fromLineIndex
  let lastLineIndex = -1;
  for (let i = fromLineIndex; i < lines.length; i++) {
    if (normalizeWhitespace(lines[i]) === normalizedLastLine) {
      lastLineIndex = i;
      break;
    }
  }

  // Ensure lastLineToMatchAndRemove was found
  if (lastLineIndex === -1) {
    throw new Error(
      `[${name}] Could not find the line "${lastLineToMatchAndRemove}" after line "${firstLineToMatchAndRemove}" in file ${file}`,
    );
  }

  // Replace the content between fromLine and toLine (inclusive)
  const beforeLines = lines.slice(0, fromLineIndex);
  const afterLines = lines.slice(lastLineIndex + 1);
  const contentsLines = replacementContent.split("\n");
  const patchedLines = [...beforeLines, ...contentsLines, ...afterLines];
  const patchedContent = patchedLines.join("\n");

  // Write the patched content back to the file
  await fileSystem.writeFile(file, patchedContent, agent);

  fileSystem.setDirty(true, agent);

  const diff = createPatch(file, originalContent, patchedContent);

  return {
    type: "text",
    text: `File successfully patched. Changes made:\n${diff}`,
    artifact: {
      name: file,
      encoding: "text",
      mimeType: "text/x-diff",
      body: diff
    }
  };
}

const description =
  "Removes blocks of content from a file, replacing the content between two matched lines with new content.";

const inputSchema = z.object({
  file: z
    .string()
    .describe("Path to the file to patch, relative to the source directory."),
  firstLineToMatchAndRemove: z
    .string()
    .describe(
      "The first line of text to remove.",
    ),
  lastLineToMatchAndRemove: z
    .string()
    .describe(
      "The last line of text to remove. The text between firstLineToMatchAndRemove and lastLineToMatchAndRemove will be removed, and replaced with the replacementContent.",
    ),
  replacementContent: z
    .string()
    .describe(
      "The content that will replace everything from the firstLineToReplace to lastLineToRemove (inclusive).",
    ),
});

export default {
  name, displayName, description, inputSchema, execute
} satisfies TokenRingToolDefinition<typeof inputSchema>;
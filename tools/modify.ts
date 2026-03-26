import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition, type TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import createFileWriteResult from "../util/createFileWriteResult.ts";
import findContiguousLineMatch from "../util/findContiguousLineMatch.ts";
import runFileValidator from "../util/runFileValidator.ts";

const name = "file_modify";
const displayName = "Filesystem/file_modify";

const fuzzyMatch = {
  minimumCharacters: 15,
  similarity: 0.95,
} as const;

function splitLines(content: string): {lines: string[]; lineEnding: string; hasTrailingLineEnding: boolean} {
  const hasTrailingLineEnding = /\r?\n$/.test(content);
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);

  if (hasTrailingLineEnding) {
    lines.pop();
  }

  return {lines, lineEnding, hasTrailingLineEnding};
}

function joinLines(lines: string[], lineEnding: string, hasTrailingLineEnding: boolean): string {
  if (lines.length === 0) {
    return "";
  }

  const content = lines.join(lineEnding);
  return hasTrailingLineEnding ? `${content}${lineEnding}` : content;
}

async function execute(
  {
    path: filePath,
    findLines,
    replaceLines,
  }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);
  const originalContent = await fileSystem.readTextFile(filePath, agent);

  if (originalContent === null) {
    throw new Error(`[${name}] Failed to read file content: ${filePath}`);
  }

  const {lines: originalLines, lineEnding, hasTrailingLineEnding} = splitLines(originalContent);
  const matchResult = findContiguousLineMatch(originalLines, findLines.split("\n"), {fuzzyMatch});

  if (!matchResult.match) {
    if (matchResult.exactMatches.length > 1) {
      throw new Error(
        `[${name}] Found ${matchResult.exactMatches.length} exact matches for the requested line block in file ${filePath}. Expected exactly one match.`,
      );
    }

    if (matchResult.fuzzyMatches.length > 1) {
      throw new Error(
        `[${name}] Found multiple fuzzy matches for the requested line block in file ${filePath}. Refine the search block so it identifies a single location.`,
      );
    }

    if (matchResult.fuzzyMatches.length === 1) {
      throw new Error(
        `[${name}] Fuzzy matched a candidate in file ${filePath}, but it was not unique enough to apply safely.`,
      );
    }

    throw new Error(
      `[${name}] Could not find the requested line block in file ${filePath}. Matching ignores whitespace and only considers whole-line contiguous blocks.`,
    );
  }

  if (matchResult.match.matchType === "fuzzy") {
    agent.infoMessage(
      `[${name}] Applying fuzzy match to ${filePath} with similarity ${matchResult.match.similarity.toFixed(3)}`,
    );
  }

  const updatedLines = [
    ...originalLines.slice(0, matchResult.match.startLineIndex),
    ...replaceLines.split("\n"),
    ...originalLines.slice(matchResult.match.endLineIndex + 1),
  ];
  const updatedContent = joinLines(updatedLines, lineEnding, hasTrailingLineEnding);
  const state = agent.getState(FileSystemState);

  if (updatedContent !== originalContent) {
    await fileSystem.writeFile(filePath, updatedContent, agent);
  }

  const validationSuffix = state.fileWrite.validateWrittenFiles
    ? await runFileValidator(filePath, updatedContent, agent)
    : "";

  return createFileWriteResult(
    filePath,
    originalContent,
    updatedContent,
    state.fileWrite.maxReturnedDiffSize,
    validationSuffix,
  );
}

const description = `
Modifies an existing file.
- Finds a contiguous block of complete lines in an existing file
- Replaces those lines with new lines.
- Matches must be exact, complete lines, with the exact prior content of the line
- Partial-line matches are never allowed.
`.trim();

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file to modify (e.g., 'src/main.ts' or 'docs/design.md'). Relative to the project root directory. Required.",
    ),
  findLines: z.string()
    .describe(
      "Up to 5 contiguous lines to match in the file. Each line must be complete, and all matched lines must be contiguous..",
    ),
  replaceLines: z.string()
    .describe(
      "The complete lines that will replace the matched block. Provide an empty array to delete the matched lines.",
    ),
});

const requiredContextHandlers = ["selected-files"];

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  requiredContextHandlers,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

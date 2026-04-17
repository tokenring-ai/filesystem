import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingToolDefinition, TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import createFileWriteResult from "../util/createFileWriteResult.ts";
import findWordMatches, {type WordMatch} from "../util/findWordMatches.ts";
import runFileValidator from "../util/runFileValidator.ts";

const name = "file_edit";
const displayName = "Filesystem/edit";

const CONTEXT_CHARS = 40;

function describeMatch(content: string, match: WordMatch, index: number): string {
  const line = content.slice(0, match.start).split("\n").length;
  const lineStart = content.lastIndexOf("\n", match.start - 1) + 1;
  const column = match.start - lineStart + 1;
  const before = content.slice(Math.max(0, match.start - CONTEXT_CHARS), match.start);
  const matched = content.slice(match.start, match.end);
  const after = content.slice(match.end, Math.min(content.length, match.end + CONTEXT_CHARS));
  return `Match ${index + 1} at line ${line}, column ${column} (chars ${match.start}-${match.end}):\n…${before}》${matched}《${after}…`;
}

async function execute(
  {path: filePath, find, replace, multiple}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const {enabled} = agent.getState(FileSystemState).fileEdit;

  if (!enabled) {
    throw new Error(
      `[${name}] File modification is disabled for this session; use the file_write tool instead for all other file updating operations, and do not use file_edit again`,
    );
  }

  const fileSystem = agent.requireServiceByType(FileSystemService);
  const originalContent = await fileSystem.readTextFile(filePath, agent);

  if (originalContent === null) {
    throw new Error(`[${name}] Failed to read file content: ${filePath}`);
  }

  const matches = findWordMatches(originalContent, find);

  if (matches.length === 0) {
    agent.mutateState(FileSystemState, (state) => {
      state.fileEdit.consecutiveFailureCount += 1;
      const {consecutiveFailureCount, disableAfterConsecutiveFailures} =
        state.fileEdit;
      if (consecutiveFailureCount >= disableAfterConsecutiveFailures) {
        state.fileEdit.enabled = false;
        agent.warningMessage(
          `[${name}] File modification tool has been disabled due to ${disableAfterConsecutiveFailures} consecutive failures.`,
        );
      }
    });
    throw new Error(
      `[${name}] Could not find the requested text in file ${filePath}. Matching is word-based: the first word must appear verbatim, and remaining words must follow in order, separated by any whitespace.`,
    );
  }

  if (matches.length > 1 && !multiple) {
    agent.mutateState(FileSystemState, (state) => {
      state.fileEdit.consecutiveFailureCount = 0;
    });
    const summary = matches
      .map((match, index) => describeMatch(originalContent, match, index))
      .join("\n\n");
    return (
      `[${name}] Found ${matches.length} matches for the requested text in ${filePath}. ` +
      `Pass multiple=true to replace all, or refine the find string to match a single location.\n\n` +
      summary
    );
  }

  agent.mutateState(FileSystemState, (state) => {
    state.fileEdit.consecutiveFailureCount = 0;
  });

  let updatedContent = "";
  let cursor = 0;
  for (const match of matches) {
    updatedContent += originalContent.slice(cursor, match.start) + replace;
    cursor = match.end;
  }
  updatedContent += originalContent.slice(cursor);

  const state = agent.getState(FileSystemState);

  if (updatedContent !== originalContent) {
    await fileSystem.writeFile(filePath, updatedContent, agent);
  }

  const validationSuffix = state.fileWrite.validateWrittenFiles
    ? await runFileValidator(filePath, updatedContent, agent)
    : null;

  return createFileWriteResult(
    filePath,
    originalContent,
    updatedContent,
    state.fileWrite.maxReturnedDiffSize,
    validationSuffix,
  );
}

const description = `
Modifies an existing file by finding a string and replacing it.
- The find string is trimmed; its first word must appear verbatim in the file.
- Remaining words in the find string must follow in order, separated by any amount of whitespace (the whitespace in the find string is not significant).
- The entire matched region (from the start of the first word through the end of the last word) is replaced with the replace string.
- If multiple matches are found and \`multiple\` is false (default), the matches are returned so you can refine the find string. Set \`multiple\` to true to replace all matches.
`.trim();

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file to edit (e.g., 'src/main.ts'). Relative to the project root directory.",
    ),
  find: z
    .string()
    .describe(
      "Text to find. Will be trimmed; whitespace between words is not significant but word order and exact word content are.",
    ),
  replace: z
    .string()
    .describe(
      "Replacement text. Replaces the matched region verbatim. Use an empty string to delete the match.",
    ),
  multiple: z
    .boolean()
    .default(false)
    .describe(
      "If true, replace every match. If false and more than one match is found, the matches are returned without modifying the file.",
    ),
});

function adjustActivation(enabled: boolean, agent: Agent) {
  return enabled && agent.getState(FileSystemState).fileEdit.enabled;
}

const requiredContextHandlers = ["selected-files"];

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  requiredContextHandlers,
  adjustActivation,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

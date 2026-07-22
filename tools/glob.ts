import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import { buildDirectorySummaryResponse } from "../util/summarizeMatchesByDirectory.ts";

const name = "file_glob";
const displayName = "Filesystem/glob";

async function execute({ filePaths }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const matchCounts: Record<string, number> = {};

  const matchedFiles = new Set<string>();
  for (const filePattern of filePaths) {
    const matches = await fileSystem.glob(filePattern, {}, agent);
    matchCounts[filePattern] = matches.length;

    for (const file of matches) {
      matchedFiles.add(file);
    }
  }

  if (matchedFiles.size === 0) {
    return {
      failed: true,
      message: `**File Glob** Found no matches`,
      actions: filePaths.map(p => `Glob ${p} - 0 matches`),
      result: `No files were found that matched the glob patterns`,
    };
  }

  const { settings } = agent.getState(FileSystemState);

  if (matchedFiles.size > settings.maxGlobbedFiles) {
    return {
      message: `**File Glob** Found ${matchedFiles.size} matches (overflow, summarizing)`,
      actions: Object.entries(matchCounts).map(m => `Glob ${m[0]} - ${m[1]} matches`),
      result: buildDirectorySummaryResponse({
        operationLabel: "glob operation",
        matchCount: matchedFiles.size,
        maxMatchedFiles: settings.maxGlobbedFiles,
        summaryDepth: settings.globSummaryDepth,
        filePaths: Array.from(matchedFiles),
      }),
    };
  }

  const fileNames = Array.from(matchedFiles).sort();
  return {
    message: `**File Glob** Found ${matchedFiles.size} matches`,
    actions: Object.entries(matchCounts).map(m => `Glob ${m[0]} - ${m[1]} matches`),
    result: `BEGIN DIRECTORY LISTING\n${fileNames.map(f => `- ${f}`).join("\n")}\nEND DIRECTORY LISTING`,
  };
}

const description = `
List files matching glob patterns relative to the project root folder.
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- When more files match than the configured limit, returns a per-directory match count summary instead of individual files.
`.trim();

const inputSchema = z
  .object({
    filePaths: z.array(z.string()).describe('List of glob patterns to match files. Examples: "**/*.ts", "path/to/file.txt"').default(["**/*"]),
  })
  .strict();

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

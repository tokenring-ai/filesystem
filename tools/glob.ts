import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import EnhancedSet from "@tokenring-ai/utility/set/enhancedSet";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import fileListing from "../util/fileListing.ts";
import { buildDirectorySummaryResponse } from "../util/summarizeMatchesByDirectory.ts";

const name = "file_glob";
const displayName = "Filesystem/glob";

async function execute({ filePaths, cwd, includeHidden, gitignore, aiignore }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);

  const matchCounts: Record<string, number> = {};

  const matchedFiles = new EnhancedSet<string>();
  for (const filePattern of filePaths) {
    const matches = await fileSystem.glob(filePattern, { ...(cwd !== undefined && { cwd }), includeHidden, gitignore, aiignore }, agent);
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
        filePaths: matchedFiles,
      }),
    };
  }

  return {
    message: `**File Glob** Found ${matchedFiles.size} matches`,
    actions: Object.entries(matchCounts).map(m => `Glob ${m[0]} - ${m[1]} matches`),
    result: fileListing(matchedFiles.values()),
  };
}

const description = `
List files matching glob patterns.
- Patterns are absolute ('/project/src/**/*.ts'), or relative when 'cwd' names the absolute allowed directory to search from.
- Results are absolute paths. When more files match than the configured limit, returns a per-directory match count summary instead of individual files.
`.trim();

const inputSchema = z
  .object({
    filePaths: z.array(z.string()).describe('List of glob patterns to match files. Examples: "/project/src/**/*.ts", or "**/*.ts" with cwd set.'),
    cwd: z.string().exactOptional().describe("Absolute, allowed directory that relative patterns are resolved against."),
    includeHidden: z.boolean().default(false).describe("Include files and directories whose name starts with '.'"),
    gitignore: z.boolean().default(true).describe("Honor nested .gitignore files while walking"),
    aiignore: z.boolean().default(true).describe("Honor nested .aiignore files while walking"),
  })
  .strict();

export default {
  name,
  displayName,
  description,
  inputSchema,
  requiredContextHandlers: ["allowed-paths"],
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

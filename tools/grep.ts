import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import fileListing from "../util/fileListing.ts";
import { buildDirectorySummaryResponse } from "../util/summarizeMatchesByDirectory.ts";

const name = "file_grep";
const displayName = "Filesystem/grep";

async function execute(
  { filePaths, searchTerms, cwd, includeHidden, gitignore, aiignore }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const { settings } = agent.getState(FileSystemState);

  const matchCounts: Record<string, number> = {};
  for (const term of searchTerms) {
    matchCounts[term] = 0;
  }

  const walkOptions = { ...(cwd !== undefined && { cwd }), includeHidden, gitignore, aiignore };
  const matchedFiles = new Set<string>();
  for (const filePattern of filePaths) {
    for (const file of await fileSystem.glob(filePattern, walkOptions, agent)) {
      matchedFiles.add(file);
    }
  }

  if (matchedFiles.size === 0) {
    return {
      failed: true,
      message: `**File Grep** Found no matches`,
      actions: searchTerms.map(t => `Grep ${t} - 0 matches`),
      result: `No files were found that matched the search criteria`,
    };
  }

  const retrievedFiles = new Map<string, string>();
  let failedReadCount = 0;
  let skippedLargeCount = 0;
  /** Reads one file; a failure (unreadable, outside the allowed paths, too large) skips only that file. */
  const readOne = async (file: string): Promise<void> => {
    if (retrievedFiles.has(file)) return;
    try {
      const stat = await fileSystem.stat(file, agent);
      if (!stat.exists || stat.isDirectory) return;
      if (settings.maxTextFileReadSize > 0 && (stat.size ?? 0) > settings.maxTextFileReadSize) {
        ++skippedLargeCount;
        return;
      }
      const contents = await fileSystem.readTextFile(file, agent);
      if (contents) retrievedFiles.set(file, contents);
      else ++failedReadCount;
    } catch {
      ++failedReadCount;
    }
  };
  for (const file of matchedFiles) {
    try {
      const stat = await fileSystem.stat(file, agent);
      if (!stat.exists) continue;
      if (stat.isDirectory) {
        // The tree is recursive and also lists the directories themselves (ending in "/").
        for await (const dirFile of fileSystem.getDirectoryTree(file, {}, agent)) {
          if (!dirFile.endsWith("/")) await readOne(dirFile);
        }
      } else {
        await readOne(file);
      }
    } catch {
      ++failedReadCount;
    }
  }

  let searchPatterns: (string | RegExp)[];
  try {
    // Regexes are matched one line at a time, like grep. (No "g" flag: test() then has no state.)
    searchPatterns = searchTerms.map(s => (s.length > 1 && s.startsWith("/") && s.endsWith("/") ? new RegExp(s.slice(1, -1), "i") : s.toLowerCase()));
  } catch (error) {
    return {
      failed: true,
      message: "**File Grep** Invalid regular expression",
      result: `A search term is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const results = new EnhancedMap<string, string>();

  for (const [file, fileContent] of retrievedFiles) {
    const lines = fileContent.split("\n");
    const lowerCaseLines = lines.map(l => l.toLowerCase());

    const matchedLines = new Set<number>();
    for (const [pi, pattern] of searchPatterns.entries()) {
      const term = searchTerms[pi]!;
      let termMatched = false;

      for (let index = 0; index < lines.length; index++) {
        if (typeof pattern === "string" ? lowerCaseLines[index]!.includes(pattern) : pattern.test(lines[index]!)) {
          matchedLines.add(index);
          termMatched = true;
        }
      }

      if (termMatched) {
        matchCounts[term]!++;
      }
    }

    for (const lineNumber of Array.from(matchedLines)) {
      for (let i = lineNumber - settings.searchSnippetLinesBefore; i <= lineNumber + settings.searchSnippetLinesAfter; i++) {
        if (i >= 0 && i < lines.length) matchedLines.add(i);
      }
    }

    if (matchedLines.size === 0) continue;

    if (results.size > settings.maxSearchSnippetCount) {
      results.set(file, "");
      continue;
    }

    const snippets: string[] = [];
    let isPadded = true;
    for (let i = 0; i < lines.length; i++) {
      if (matchedLines.has(i)) {
        isPadded = false;
        snippets.push(`${i}: ${lines[i]}`);
      } else if (!isPadded) {
        isPadded = true;
        snippets.push("");
      }
    }

    if (snippets.length > 0) {
      const snippetString = snippets.join("\n");
      if (snippetString.length > fileContent.length * settings.maxSearchSnippetSizePercent) {
        results.set(file, `BEGIN FILE ATTACHMENT: ${file}\n${fileContent}\nEND FILE ATTACHMENT`);
        continue;
      }
      results.set(file, `BEGIN FILE GREP MATCHES: ${file} (line: match)\n${snippets.join("\n")}\nEND FILE GREP MATCHES`);
    }
  }

  const actions = Object.entries(matchCounts).map(m => `Grep ${m[0]} - ${m[1]} matches`);
  if (failedReadCount > 0) actions.push(`Failed to read ${failedReadCount} files`);
  if (skippedLargeCount > 0) actions.push(`Skipped ${skippedLargeCount} files larger than ${settings.maxTextFileReadSize} bytes`);

  if (results.size > settings.maxGrepResults) {
    return {
      message: `**File Grep** Found ${results.size} matches (overflow, summarizing)`,
      actions,
      result: buildDirectorySummaryResponse({
        operationLabel: "grep operation",
        matchCount: results.size,
        maxMatchedFiles: settings.maxGrepResults,
        summaryDepth: settings.globSummaryDepth,
        filePaths: results.keys(),
      }),
    };
  }

  if (results.size > settings.maxSearchSnippetCount) {
    return {
      message: `**File Grep** Found ${results.size} matches (overflow, summarizing)`,
      actions,
      result: `
The grep operation matched ${results.size} files, which is higher than the user specified limit of ${settings.maxSearchSnippetCount}.
The list of matched files will be returned as a file listing instead.

${fileListing(results.keys())}
`.trim(),
    };
  }

  return {
    message: `**File Grep** Found ${results.size} matches`,
    actions,
    result: results.valuesArray().join("\n\n"),
  };
}

const description = `
Search for text patterns within files. Supports plain string and regex patterns.
- File patterns are absolute ('/project/src/**/*.ts'), or relative when 'cwd' names the absolute allowed directory to search from.
- Searches are OR-based across multiple patterns (any match counts).
- Automatically returns complete file contents, directory listings, directory summaries, or grep-style snippets based on match count.
- When more files match than the configured limit, returns a per-directory match count summary instead of individual files.
`.trim();

const inputSchema = z
  .object({
    filePaths: z
      .array(z.string())
      .describe('List of absolute file paths or glob patterns to search within; relative patterns require cwd. Examples: "/project/src/**/*.ts"')
      .default(["**/*"]),
    searchTerms: z
      .array(z.string())
      .describe('List of search terms. Plain strings use fuzzy substring match; wrap in \'/\' for regex. Examples: "searchTerm", "/searchTerm.*/"'),
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

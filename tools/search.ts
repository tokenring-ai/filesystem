import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

const name = "file/search";

export interface FileSearchResult {
  files: Array<{
    file: string;
    exists: boolean;
    content: string | null;
    error?: string;
  }>;
  matches: Array<{
    file: string;
    line: number;
    match: string;
    matchedPattern: string;
    content: string | null;
  }>;
  summary: {
    totalFiles: number;
    totalMatches: number;
    searchPatterns?: string[];
    returnType: "names" | "content" | "matches";
    limitExceeded: boolean;
  };
}

async function execute(
  {
    files,
    searches,
    linesBefore = 0,
    linesAfter = 0,
    returnType = "content",
    caseSensitive = true,
    matchType = "substring",
  }: z.infer<typeof inputSchema>,
  agent: Agent,
): Promise<FileSearchResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  agent.infoLine(`[${name}] Using ${fileSystem.name} file system`);

  //console.log({files, searches, linesBefore, linesAfter, returnType, caseSensitive, matchType});

  // Validate parameters
  if (!files && !searches) {
    throw new Error(
      `[${name}] Either 'files' or 'searches' parameter must be provided`,
    );
  }

  if (
    returnType !== "names" &&
    returnType !== "content" &&
    returnType !== "matches"
  ) {
    throw new Error(
      `[${name}] returnType must be one of: 'names', 'content', or 'matches'`,
    );
  }

  if (
    matchType !== "substring" &&
    matchType !== "whole-word" &&
    matchType !== "regex"
  ) {
    throw new Error(
      `[${name}] matchType must be one of: 'substring', 'whole-word', or 'regex'`,
    );
  }

  // Note: fileSystemType is currently unused and reserved for future multi-filesystem support. It has no effect.

  // When returnType is 'matches', set linesBefore and linesAfter to 10 if not provided
  if (returnType === "matches" && linesBefore === 0 && linesAfter === 0) {
    linesBefore = 10;
    linesAfter = 10;
  }

  // Initialize result structure
  const result: FileSearchResult = {
    files: [],
    matches: [],
    summary: {
      totalFiles: 0,
      totalMatches: 0,
      searchPatterns: searches,
      returnType,
      limitExceeded: false,
    },
  };

  // Search mode - searching across all files
  if (searches && !files) {
    return await fileSearch(
      searches,
      linesBefore,
      linesAfter,
      returnType,
      caseSensitive,
      matchType,
      fileSystem,
      agent,
    );
  }

  // Retrieve files first (whether to return them directly or search within them)
  let resolvedFiles: string[] = [];

  // Handle glob patterns in files array
  if (files) {
    for (const filePattern of files) {
      try {
        // Paths are relative to the filesystem root unless starting with '/', in which case they are absolute.
        // Use Unix-style '/' separators regardless of platform.
        // If it's a glob pattern, resolve it
        if (filePattern.includes("*") || filePattern.includes("?")) {
          agent.infoLine(`[${name}] Resolving glob pattern: ${filePattern}`);
          const matchedFiles = await fileSystem.glob(filePattern);
          resolvedFiles.push(...matchedFiles);
        } else {
          // It's a direct file path
          resolvedFiles.push(filePattern);
        }
      } catch (err: any) {
        // Treat pattern resolution errors as informational
        agent.infoLine(
          `[${name}] Error resolving pattern ${filePattern}: ${err.message}`,
        );
      }
    }

    // Remove duplicates
    resolvedFiles = [...new Set(resolvedFiles)];

    if (resolvedFiles.length === 0) {
      result.summary.totalFiles = 0;
      return result;
    }

    agent.infoLine(`[${name}] Resolved ${resolvedFiles.length} files`);
  }

  if (resolvedFiles.length > 50 && returnType !== "names") {
    agent.infoLine(
      `[${name}] Found ${resolvedFiles.length} files which exceeds the limit of 50 for '${returnType}' mode. Degrading to 'names' mode.`,
    );
    returnType = "names";
    result.summary.returnType = "names";
    result.summary.limitExceeded = true;
  }

  // Fetch file contents (only text files; binaries are skipped)
  const fileResults: Array<{
    file: string;
    exists: boolean;
    content: string | null;
    error?: string;
  }> = [];
  for (const file of resolvedFiles) {
    try {
      const exists = await fileSystem.exists(file);
      if (!exists) {
        agent.infoLine(
          `[${name}] Cannot retrieve file ${file}: file not found.`,
        );
        fileResults.push({file, exists: false, content: null});
        continue;
      }

      const content =
        returnType === "names" ? null : await fileSystem.getFile(file);
      if (returnType !== "names") {
        agent.infoLine(`[${name}] Retrieved file ${file}`);
      }
      fileResults.push({file, exists: true, content});
    } catch (err: any) {
      agent.infoLine(`[${name}] Error retrieving ${file}: ${err.message}`);
      fileResults.push({
        file,
        exists: false,
        content: null,
        error: err.message,
      });
    }
  }

  result.files = fileResults;
  result.summary.totalFiles = fileResults.length;

  // If we need to search within specific files
  if (searches && returnType === "matches") {
    const matches = await searchInFiles(
      fileResults,
      searches,
      linesBefore,
      linesAfter,
      caseSensitive,
      matchType,
      agent,
    );
    result.matches = matches.matches;
    result.summary.totalMatches = matches.matches.length;
    result.summary.limitExceeded = matches.limitExceeded;
  }

  return result;
}

/**
 * Search across all files in the filesystem
 */
async function fileSearch(
  searchPatterns: string[],
  linesBefore: number,
  linesAfter: number,
  returnType: "names" | "content" | "matches",
  caseSensitive: boolean,
  matchType: "substring" | "whole-word" | "regex",
  fileSystem: FileSystemService,
  agent: Agent,
): Promise<FileSearchResult> {
  agent.infoLine(
    `[${name}] Searching for patterns: ${JSON.stringify(searchPatterns)} with matchType: ${matchType}, caseSensitive: ${caseSensitive}`,
  );

  const result: FileSearchResult = {
    files: [],
    matches: [],
    summary: {
      totalFiles: 0,
      totalMatches: 0,
      searchPatterns,
      returnType,
      limitExceeded: false,
    },
  };

  try {
    const options = {
      includeContent: {
        linesBefore,
        linesAfter,
      },
      caseSensitive,
      matchType, // Assume FileSystemService.grep now supports these options
    } as const;

    const results = await fileSystem.grep(searchPatterns, options);

    if (results.length === 0) {
      return result;
    }

    if (results.length > 50 && returnType === "matches") {
      agent.infoLine(
        `[${name}] Found ${results.length} matches which exceeds the limit of 50 for 'matches' mode. Degrading to 'names' mode.`,
      );

      const uniqueFiles = [...new Set(results.map((result) => result.file))];
      result.files = uniqueFiles.map((file) => ({
        file,
        exists: true,
        content: null,
      }));
      result.summary.totalFiles = uniqueFiles.length;
      result.summary.totalMatches = results.length;
      result.summary.returnType = "names";
      result.summary.limitExceeded = true;
      return result;
    }

    // Convert grep results to our standardized format
    const matches = results.map((grepResult) => ({
      file: grepResult.file,
      line: grepResult.line,
      match: grepResult.match,
      matchedPattern: grepResult.matchedString || searchPatterns[0],
      content: grepResult.content,
    }));

    result.matches = matches;
    result.summary.totalMatches = matches.length;

    // Also populate files array with unique files
    const uniqueFiles = [...new Set(results.map((result) => result.file))];
    result.files = uniqueFiles.map((file) => ({
      file,
      exists: true,
      content: null,
    }));
    result.summary.totalFiles = uniqueFiles.length;

    return result;
  } catch (err: any) {
    throw new Error(`[${name}] Search error: ${err.message}`);
  }
}

/**
 * Search within specific files
 */
async function searchInFiles(
  fileResults: Array<{ file: string; exists: boolean; content: string | null }>,
  searchPatterns: string[],
  linesBefore: number,
  linesAfter: number,
  caseSensitive: boolean,
  matchType: "substring" | "whole-word" | "regex",
  agent: Agent,
): Promise<{
  matches: Array<{
    file: string;
    line: number;
    match: string;
    matchedPattern: string;
    content: string | null;
  }>;
  limitExceeded: boolean;
}> {
  agent.infoLine(
    `[${name}] Searching for patterns: ${JSON.stringify(searchPatterns)} in ${fileResults.length} files with matchType: ${matchType}, caseSensitive: ${caseSensitive}`,
  );

  const allMatches: Array<{
    file: string;
    line: number;
    match: string;
    matchedPattern: string;
    content: string | null;
  }> = [];

  for (const fileResult of fileResults) {
    if (!fileResult.exists || !fileResult.content) {
      continue;
    }

    const fileContent = fileResult.content;
    let lines = fileContent.split("\n");

    // If not case-sensitive, normalize lines to lowercase
    const normalizedLines = caseSensitive
      ? lines
      : lines.map((line) => line.toLowerCase());

    for (let lineNum = 0; lineNum < normalizedLines.length; lineNum++) {
      const normalizedLine = normalizedLines[lineNum];
      const originalLine = lines[lineNum];

      let matchFound = false;
      let matchedPattern = "";

      for (const pattern of searchPatterns) {
        const normalizedPattern = caseSensitive
          ? pattern
          : pattern.toLowerCase();
        let regex: RegExp;

        switch (matchType) {
          case "substring":
            if (normalizedLine.includes(normalizedPattern)) {
              matchFound = true;
              matchedPattern = pattern;
            }
            break;
          case "whole-word":
            regex = new RegExp(`\\b${escapeRegExp(normalizedPattern)}\\b`);
            if (regex.test(normalizedLine)) {
              matchFound = true;
              matchedPattern = pattern;
            }
            break;
          case "regex":
            try {
              regex = new RegExp(normalizedPattern);
              if (regex.test(normalizedLine)) {
                matchFound = true;
                matchedPattern = pattern;
              }
            } catch (e) {
              agent.infoLine(`[${name}] Invalid regex pattern: ${pattern}`);
              continue;
            }
            break;
        }

        if (matchFound) {
          const startLine = Math.max(0, lineNum - linesBefore);
          const endLine = Math.min(lines.length - 1, lineNum + linesAfter);

          const contextLines = lines.slice(startLine, endLine + 1);
          const content = contextLines.join("\n");

          allMatches.push({
            file: fileResult.file,
            line: lineNum + 1,
            match: originalLine,
            matchedPattern,
            content,
          });
          break; // Stop after first matching pattern (OR behavior)
        }
      }
    }
  }

  let limitExceeded = false;
  if (allMatches.length > 50) {
    agent.infoLine(
      `[${name}] Found ${allMatches.length} matches which exceeds the limit of 50 for 'matches' mode.`,
    );
    limitExceeded = true;
  }

  return {matches: allMatches, limitExceeded};
}

// Helper to escape regex special chars for whole-word mode
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const description = `
Retrieve a list of file names, file contents, or search matches based on file paths/globs or full-text search across text files in the filesystem.
- The filesystem scope is the entire sandboxed root directory accessible by the FileSystemService (e.g., the project's root folder).
- Binary files and files in .gitignore are skipped; only text files (UTF-8 encoded) are processed.
- Searches are OR-based across multiple patterns (any match counts).
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- Returns a structured object with files, matches, and summary information.
- Limits: Up to 50 results for 'content' or 'matches'; degrades to 'names' if exceeded.
  `.trim();

const inputSchema = z
  .object({
    files: z
      .array(z.string())
      .describe(
        "List of file paths or glob patterns (e.g., '**/*.ts', '/path/to/file.txt'). Omit to search across all accessible text files when using 'searches'. Required if no 'searches' provided.",
      )
      .optional(),
    searches: z
      .array(z.string())
      .describe(
        "List of search patterns (substrings, words, or regex depending on 'matchType'). Omit to retrieve files without searching. Required if no 'files' provided.",
      )
      .optional(),
    returnType: z
      .enum(["names", "content", "matches"])
      .describe(
        "'names': Return file paths only. 'content': Return full contents of matched/retrieved files. 'matches': Return matched lines with context. Default: 'content'.",
      )
      .optional(),
    linesBefore: z
      .number()
      .int()
      .min(0)
      .describe(
        "Lines before each match to include in 'matches' mode. Default: 0 (or 10 if 'matches' and unset).",
      )
      .optional(),
    linesAfter: z
      .number()
      .int()
      .min(0)
      .describe(
        "Lines after each match to include in 'matches' mode. Default: 0 (or 10 if 'matches' and unset).",
      )
      .optional(),
    caseSensitive: z
      .boolean()
      .describe("Whether searches are case-sensitive. Default: true.")
      .optional(),
    matchType: z
      .enum(["substring", "whole-word", "regex"])
      .describe(
        "'substring': Partial string match. 'whole-word': Exact word (bounded by word chars). 'regex': Treat patterns as regex (may throw if invalid). Default: 'substring'.",
      )
      .optional(),
    // fileSystemType omitted from schema as it's unused; can be added later if needed
  })
  .strict();


export default {
  name, description, inputSchema, execute,
} as TokenRingToolDefinition<typeof inputSchema>;

import ChatService from "@token-ring/chat/ChatService";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import type {Registry} from "@token-ring/registry";

export async function execute(
  {
    files,
    searches,
    linesBefore = 0,
    linesAfter = 0,
    returnType = "content",
    fileSystemType,
  }: {
    files?: string[];
    searches?: string[];
    linesBefore?: number;
    linesAfter?: number;
    returnType?: "names" | "content" | "matches";
    fileSystemType?: string;
  },
  registry: Registry,
): Promise<any> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const fileSystem = registry.requireFirstServiceByType(FileSystemService);

  chatService.infoLine(`[fileManager] Using ${fileSystem.name} file system`);

  // Validate parameters
  if (!files && !searches) {
    throw new Error("Either 'files' or 'searches' parameter must be provided");
  }

  if (returnType !== "names" && returnType !== "content" && returnType !== "matches") {
    throw new Error("returnType must be one of: 'names', 'content', or 'matches'");
  }

  // When returnType is 'matches', set linesBefore and linesAfter to 10
  if (returnType === "matches") {
    linesBefore = 10;
    linesAfter = 10;
  }

  // Search mode - searching across all files
  if (searches && !files) {
    return await fileSearch(searches, linesBefore, linesAfter, returnType, fileSystem, chatService);
  }

  // Retrieve files first (whether to return them directly or search within them)
  let resolvedFiles: string[] = [];

  // Handle glob patterns in files array
  if (files) {
    for (const filePattern of files) {
      try {
        // If it's a glob pattern, resolve it
        if (filePattern.includes("*") || filePattern.includes("?")) {
          chatService.infoLine(`Resolving glob pattern: ${filePattern}`);
          const matchedFiles = await fileSystem.glob(filePattern);
          resolvedFiles.push(...matchedFiles);
        } else {
          // It's a direct file path
          resolvedFiles.push(filePattern);
        }
      } catch (err: any) {
        chatService.errorLine(`Error resolving pattern ${filePattern}: ${err.message}`);
      }
    }

    // Remove duplicates
    resolvedFiles = [...new Set(resolvedFiles)];

    if (resolvedFiles.length === 0) {
      return returnType === "matches" ? "No files found matching the specified patterns" : [];
    }

    chatService.infoLine(`Resolved ${resolvedFiles.length} files`);
  }

  if (resolvedFiles.length > 50 && returnType !== "names") {
    chatService.infoLine(
      `Found ${resolvedFiles.length} files which exceeds the limit of 50 for '${returnType}' mode. Degrading to 'names' mode.`,
    );
    returnType = "names";
  }

  // If only filenames are requested
  if (returnType === "names") {
    return resolvedFiles;
  }

  // Fetch file contents
  const fileResults: Array<{ file: string; exists: boolean; content: string | null; error?: string }> = [];
  for (const file of resolvedFiles) {
    try {
      const exists = await fileSystem.exists(file);
      if (!exists) {
        chatService.errorLine(`Cannot retrieve file ${file}: file not found.`);
        fileResults.push({ file, exists: false, content: null });
        continue;
      }

      const content = await fileSystem.getFile(file);
      chatService.infoLine(`Retrieved file ${file}`);
      fileResults.push({ file, exists: true, content });
    } catch (err: any) {
      chatService.errorLine(`Error retrieving ${file}: ${err.message}`);
      fileResults.push({ file, exists: false, content: null, error: err.message });
    }
  }

  // If we need the file content, return here
  if (returnType === "content" || !searches) {
    return fileResults;
  }

  // If we need to search within specific files
  if (searches && returnType === "matches") {
    return await searchInFiles(fileResults, searches, linesBefore, linesAfter, fileSystem, chatService);
  }
}

/**
 * Search across all files in the filesystem
 */
async function fileSearch(
  searchString: string | string[],
  linesBefore: number,
  linesAfter: number,
  returnType: "names" | "content" | "matches",
  fileSystem: FileSystemService,
  chatService: any,
): Promise<string> {
  // If searchString is an array, log all strings being searched
  if (Array.isArray(searchString)) {
    chatService.infoLine(`[fileManager] Searching for multiple patterns: ${JSON.stringify(searchString)}`);
  } else {
    chatService.infoLine(`[fileManager] Searching for "${searchString}"`);
  }

  try {
    const options = {
      includeContent: {
        linesBefore,
        linesAfter,
      },
    } as const;

    const results = await fileSystem.grep(searchString, options);

    if (results.length === 0) {
      const searchDesc = Array.isArray(searchString) ? `any of the patterns: ${JSON.stringify(searchString)}` : `"${searchString}"`;
      return `No files found containing: ${searchDesc}`;
    }

    // Check for match limits and degrade if necessary
    if (results.length > 50 && returnType === "matches") {
      chatService.infoLine(
        `Found ${results.length} matches which exceeds the limit of 50 for 'matches' mode. Degrading to 'names' mode.`,
      );

      // Return only the unique file names
      const uniqueFiles = [...new Set(results.map((result) => result.file))];
      return `Found ${results.length} matches in ${uniqueFiles.length} files. Showing file names only due to result limit:\n\n${uniqueFiles.join(
        "\n",
      )}`;
    }

    // Format results
    return formatSearchResults(results, searchString, linesBefore);
  } catch (err: any) {
    chatService.errorLine(`[fileManager] Search error: ${err.message}`);
    return `Error searching files: ${err.message}`;
  }
}

/**
 * Search within specific files
 */
async function searchInFiles(
  fileResults: Array<{ file: string; exists: boolean; content: string | null }>,
  searchString: string | string[],
  linesBefore: number,
  linesAfter: number,
  _fileSystem: FileSystemService,
  chatService: any,
): Promise<string> {
  // If searchString is an array, log all strings being searched
  if (Array.isArray(searchString)) {
    chatService.infoLine(
      `[fileManager] Searching for multiple patterns: ${JSON.stringify(searchString)} in ${fileResults.length} files`,
    );
  } else {
    chatService.infoLine(
      `[fileManager] Searching for "${searchString}" in ${fileResults.length} files`,
    );
  }

  const allMatches: Array<{
    file: string;
    line: number;
    match: string;
    matchedString?: string;
    content: string | null;
  }> = [];

  for (const fileResult of fileResults) {
    if (!fileResult.exists || !fileResult.content) {
      continue;
    }

    const fileContent = fileResult.content;
    const lines = fileContent.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check if line includes any of the search strings
      let matchFound = false;
      let matchedString = "";

      if (Array.isArray(searchString)) {
        for (const pattern of searchString) {
          if (line.includes(pattern)) {
            matchFound = true;
            matchedString = pattern;
            break;
          }
        }
      } else if (line.includes(searchString)) {
        matchFound = true;
        matchedString = searchString;
      }

      if (matchFound) {
        // Calculate context lines
        const startLine = Math.max(0, lineNum - linesBefore);
        const endLine = Math.min(lines.length - 1, lineNum + linesAfter);

        // Extract context
        const contextLines = lines.slice(startLine, endLine + 1);
        const content = contextLines.join("\n");

        allMatches.push({
          file: fileResult.file,
          line: lineNum + 1, // 1-based line numbering
          match: line,
          matchedString: matchedString,
          content,
        });
      }
    }
  }

  if (allMatches.length === 0) {
    const searchDesc = Array.isArray(searchString)
      ? `any of the patterns: ${JSON.stringify(searchString)}`
      : `"${searchString}"`;
    return `No matches found for ${searchDesc} in the specified files`;
  }

  // Check for match limits and degrade if necessary
  if (allMatches.length > 50) {
    chatService.infoLine(
      `Found ${allMatches.length} matches which exceeds the limit of 50 for 'matches' mode. Degrading to file names only.`,
    );

    // Return only the unique file names
    const uniqueFiles = [...new Set(allMatches.map((match) => match.file))];
    return `Found ${allMatches.length} matches in ${uniqueFiles.length} files. Showing file names only due to result limit:\n\n${uniqueFiles.join(
      "\n",
    )}`;
  }

  return formatSearchResults(allMatches, searchString, linesBefore);
}

/**
 * Format search results into a readable string
 */
function formatSearchResults(
  results: Array<{ file: string; line: number; match: string; matchedString?: string; content: string | null }>,
  searchString: string | string[],
  linesBefore: number,
): string {
  const searchDesc = Array.isArray(searchString) ? `the specified patterns` : `"${searchString}"`;

  let output = `Found ${results.length} matches for ${searchDesc}:\n\n`;

  const fileMatches: Record<string, typeof results> = {};

  // Group results by file
  for (const result of results) {
    if (!fileMatches[result.file]) {
      fileMatches[result.file] = [] as unknown as typeof results;
    }
    fileMatches[result.file].push(result);
  }

  // Format output by file
  for (const [file, matches] of Object.entries(fileMatches)) {
    output += `File: ${file}\n`;

    for (const match of matches) {
      const _matchedText = match.matchedString || searchString;
      output += `  Line ${match.line}: ${match.match.trim()}\n`;

      if (match.content) {
        const contentLines = match.content.split("\n");
        const contentWithLineNumbers = contentLines
          .map((line, idx) => {
            const lineNumber = match.line - linesBefore + idx;
            const prefix = lineNumber === match.line ? "> " : "  ";
            return `    ${prefix}${lineNumber}: ${line}`;
          })
          .join("\n");

        output += `${contentWithLineNumbers}\n\n`;
      }
    }

    output += "\n";
  }

  return output.trim();
}

export const description =
  "Retrieve a file list or file contents based on any combination of file name, file path, or full text search. ";

export const parameters = z
  .object({
    files: z
      .array(z.string())
      .describe(
        "List of file names or file glob patterns to retrieve ex: **/file.ts, **/*.ts, or /path/to/file.ts. Required if 'searches' is not provided or if searching within specific files.",
      )
      .optional(),
    searches: z
      .array(z.string())
      .describe(
        "List of strings to search for in file contents. If 'files' is not provided, searches across the entire accessible filesystem.",
      )
      .optional(),
    returnType: z
      .enum(["names", "content", "matches"])
      .describe(
        "What to return: 'names' (filenames only), 'content' (full file content), or 'matches' (matched lines including context lines). Default: content",
      )
      .optional(),
    linesBefore: z
      .number()
      .int()
      .describe(
        "Number of lines before a match to include when returnType is 'matches'. Defaults to 0, or 10 if returnType is 'matches' and this is not set.",
      )
      .default(0)
      .optional(),
    linesAfter: z
      .number()
      .int()
      .describe(
        "Number of lines after a match to include when returnType is 'matches'. Defaults to 0, or 10 if returnType is 'matches' and this is not set.",
      )
      .default(0)
      .optional(),
  })
  .strict();

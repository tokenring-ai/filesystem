import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import formatError from "@tokenring-ai/utility/error/formatError";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import { buildDirectorySummaryResponse } from "../util/summarizeMatchesByDirectory.ts";

const name = "file_search";
const displayName = "Filesystem/search";

async function execute({ filePaths, searchTerms }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const matchCounts: Record<string, number> = {};
  for (const term of searchTerms) {
    matchCounts[term] = 0;
  }

  const matchedFiles = new Set<string>();
  for (const filePattern of filePaths) {
    for (const file of await fileSystem.glob(filePattern, {}, agent)) {
      matchedFiles.add(file);
    }
  }

  if (matchedFiles.size === 0) {
    return {
      failed: true,
      message: `**File** Search for ${searchTerms.join(", ")} in ${filePaths.join(", ")} - 0 matches`,
      actions: searchTerms.map(t => `Search ${t} - 0 matches`),
      result: `No files were found that matched the search criteria`,
    };
  }

  const { settings } = agent.getState(FileSystemState);

  const retrievedFiles = new Map<string, string>();
  for (const file of matchedFiles) {
    try {
      const stat = await fileSystem.stat(file, agent);
      if (stat.exists) {
        if (stat.isDirectory) {
          for await (const dirFile of fileSystem.getDirectoryTree(file, {}, agent)) {
            if (retrievedFiles.has(dirFile)) break;
            const contents = await fileSystem.readTextFile(file, agent);
            if (contents) retrievedFiles.set(file, contents);
            else agent.warningMessage(`[${name}] Couldn't read file ${file}`);
          }
        } else {
          const contents = await fileSystem.readTextFile(file, agent);
          if (contents) retrievedFiles.set(file, contents);
          else agent.warningMessage(`[${name}] Couldn't read file ${file}`);
        }
      }
    } catch (err) {
      agent.warningMessage(`[${name}] Error reading file ${file}: ${formatError(err)}`);
    }
  }

  const searchPatterns = searchTerms.map(s => {
    if (s.startsWith("/") && s.endsWith("/")) {
      return new RegExp(s.slice(1, -1), "si");
    } else {
      return s.toLowerCase();
    }
  });

  const results = new Map<string, string>();

  for (const [file, fileContent] of retrievedFiles.entries()) {
    const lines = fileContent.split("\n");
    const lowerCaseLines = lines.map(l => l.toLowerCase());

    const matchedLines = new Set<number>();
    for (const [pi, pattern] of searchPatterns.entries()) {
      const term = searchTerms[pi]!;
      let termMatched = false;

      if (typeof pattern === "string") {
        lowerCaseLines.forEach((line, i) => {
          if (line.includes(pattern)) {
            matchedLines.add(i);
            termMatched = true;
          }
        });
      } else {
        pattern.lastIndex = 0;

        let result: RegExpExecArray | null;
        while ((result = pattern.exec(fileContent))) {
          const prefix = fileContent.substring(0, result.length - 1);
          const lineNumber = prefix.split("\n").length - 1;
          matchedLines.add(lineNumber);
          termMatched = true;
        }
      }

      if (termMatched) {
        matchCounts[term]!++;
      }
    }

    // The set is copied into an array since we are going to update it
    for (const lineNumber of Array.from(matchedLines.values())) {
      for (let i = lineNumber - settings.searchSnippetLinesBefore; i < lineNumber + settings.searchSnippetLinesAfter; i++) {
        if (i >= 0 && i < lines.length) {
          matchedLines.add(i);
        }
      }
    }

    // If there are no matches, skip to the next file
    if (matchedLines.size === 0) {
      continue;
    }

    if (results.size > settings.maxSearchSnippetCount) {
      // We have already matched too many files, so we will not bother creating the snippet content,
      // we will just add the filename to the set, since it will not be returned
      results.set(file, "");
      continue;
    }

    const snippets: string[] = [];

    let isPadded = true;
    for (let i = 0; i < lines.length; i++) {
      if (matchedLines.has(i)) {
        isPadded = false;
        snippets.push(`${i}: ${lines[i]}`);
      } else {
        if (!isPadded) {
          isPadded = true;
          snippets.push("");
        }
      }
    }

    if (snippets.length > 0) {
      const snippetString = snippets.join("\n");
      // If there are too many snippets, send the whole file
      if (snippetString.length > fileContent.length * settings.maxSearchSnippetSizePercent) {
        results.set(file, `BEGIN FILE ATTACHMENT: ${file}\n${fileContent}\nEND FILE ATTACHMENT`);
        continue;
      }

      results.set(file, `BEGIN FILE GREP MATCHES: ${file} (line: match)\n${snippets.join("\n")}\nEND FILE GREP MATCHES`);
    }
  }

  const actions = Object.entries(matchCounts).map(m => `Search ${m[0]} - ${m[1]} matches`);

  if (results.size > settings.maxGlobbedFiles) {
    return {
      message: `**File** Search for ${searchTerms.join(", ")} in ${filePaths.join(", ")} - ${results.size} matches (overflow, summarizing)`,
      actions,
      result: buildDirectorySummaryResponse({
        operationLabel: "file search operation",
        matchCount: results.size,
        maxMatchedFiles: settings.maxGlobbedFiles,
        summaryDepth: settings.globSummaryDepth,
        filePaths: Array.from(results.keys()),
      }),
    };
  }

  if (results.size > settings.maxSearchSnippetCount) {
    agent.infoMessage(`[${name}] Too many files were matched. Returning only the names.`);

    const fileNames = Array.from(results.keys()).sort();

    return {
      message: `**File** Search for ${searchTerms.join(", ")} in ${filePaths.join(", ")} - ${results.size} matches (overflow, summarizing)`,
      actions,
      result: `
The file search operation matched ${results.size} files, which is higher than the user specified limit of ${settings.maxSearchSnippetCount}.
The list of matched files will be returned as a directory listing instead.

BEGIN DIRECTORY LISTING
${fileNames.map(f => `- ${f}`).join("\n")}
END DIRECTORY LISTING
`.trim(),
    };
  }

  return {
    message: `**File** Search for ${searchTerms.join(", ")} in ${filePaths.join(", ")} - ${results.size} matches`,
    actions,
    result: Array.from(results.values()).join("\n\n"),
  };
}

const description = `
Search for text patterns in files. Supports searching across all files or within specific files.
- The search will be run inside the root folder the user has designated for the project
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- Searches are OR-based across multiple patterns (any match counts).
- Automatically returns complete file contents, directory listings, directory summaries, or grep-style snippets based on match count.
- When more files match than the configured limit, returns a per-directory match count summary instead of individual files.
`.trim();

const inputSchema = z
  .object({
    filePaths: z
      .array(z.string())
      .describe(
        'List of file paths or glob patterns to search within. Omit to search across all files in the project directory. Examples: "**/*.ts", "path/to/file.txt")',
      )
      .default(["**/*"]),
    searchTerms: z
      .array(z.string())
      .describe(
        'List of search terms to search for. Search terms can either by plain strings, which will be matched by a fuzzy substring search, or regex, if enclosed in \'/\'. Examples: "searchTerm", "/searchTerm.*/"',
      ),
  })
  .strict();

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

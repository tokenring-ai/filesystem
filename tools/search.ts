import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

const name = "file_search";

export type MatchType = "substring" | "whole-word" | "regex";

export interface MatchInfo {
  file: string;
  line: number;
  match: string;
  matchedPattern: string;
  content?: string;
}

export interface SearchSummary {
  totalMatches: number;
  totalFiles: number;
  searchPatterns: string[];
  returnType: "names" | "matches";
  limitExceeded: boolean;
}

export interface FileSearchResult {
  files: string[];
  matches: MatchInfo[];
  summary: SearchSummary;
}

async function execute(
  {
    files,
    searches,
  }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const matchedFiles = new Set<string>();
  for (const filePattern of files) {
    for (const file of await fileSystem.glob(filePattern, {}, agent)) {
      matchedFiles.add(file);
    }
  }

  agent.infoMessage(`[${name}] files=${files.join(", ")} searches=${searches.join(", ")} matchedFiles=${matchedFiles.size}`);

  if (matchedFiles.size === 0) {
    return `No files were found that matched the search criteria`;
  }

  const options = agent.getState(FileSystemState).fileSearch;

  const retrievedFiles = new Map<string, string>();
  for (const file of matchedFiles) {
    try {
      const stat = await fileSystem.stat(file, agent);
      if (stat.isDirectory) {
        for await (const dirFile of fileSystem.getDirectoryTree(file, {}, agent)) {
          if (retrievedFiles.has(dirFile)) break;
          const contents = await fileSystem.readTextFile(file, agent);
          if (contents) retrievedFiles.set(file, contents);
          else agent.infoMessage(`[${name}] Couldn't read file ${file}`)
        }
      } else {
        const contents = await fileSystem.readTextFile(file, agent);
        if (contents) retrievedFiles.set(file, contents);
        else agent.infoMessage(`[${name}] Couldn't read file ${file}`)
      }
    } catch (err: any) {
      agent.infoMessage(
        `[${name}] Error reading file ${file}: ${err.message}`,
      );
    }
  }

  const searchPatterns = searches.map(s => {
    if (s.startsWith("/") && s.endsWith("/")) {
      return new RegExp(s.slice(1, -1), "si");
    } else {
      return s.toLowerCase();
    }
  });

  const results = new Map<string, string>

  for (const [file, fileContent] of retrievedFiles.entries()) {
    let lines = fileContent.split("\n");
    let lowerCaseLines = lines.map(l => l.toLowerCase());

    const matchedLines = new Set<number>;
    for (let pattern of searchPatterns) {
      if (typeof pattern === 'string') {
        for (let i = 0; i < lowerCaseLines.length; i++) {
          if (lowerCaseLines[i].includes(pattern)) {
            matchedLines.add(i);
          }
        }
      } else {
        pattern.lastIndex = 0;

        let result;
        while (result = pattern.exec(fileContent)) {
          const prefix = fileContent.substring(0, result.length - 1);
          const lineNumber = prefix.split("\n").length - 1;
          matchedLines.add(lineNumber);
        }
      }
    }

    // The set is copied into an array since we are going to update it
    for (const lineNumber of Array.from(matchedLines.values())) {
      for (let i = lineNumber - options.snippetLinesBefore; i < lineNumber + options.snippetLinesAfter; i++) {
        if (i >= 0 && i < lines.length) {
          matchedLines.add(i);
        }
      }
    }

    // If there are no matches, skip to the next file
    if (matchedLines.size === 0) {
      continue;
    }

    if (results.size > options.maxSnippetCount) {
      // We have already matched too many files, so we will not bother creating the snippet content,
      // we will just add the filename to the set, since it will not be returned
      results.set(file, "");
      continue;
    }

    let snippets: string[] = [];

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
      if (snippetString.length > fileContent.length * options.maxSnippetSizePercent) {
        results.set(file, `BEGIN FILE ATTACHMENT: ${file}\n${fileContent}\nEND FILE ATTACHMENT`)
        continue;
      }

      results.set(file, `BEGIN FILE GREP MATCHES: ${file} (line: match)\n${snippets.join("\n")}\nEND FILE GREP MATCHES`);
    }
  }

  if (results.size > options.maxSnippetCount) {
    agent.infoMessage(`[${name}] Too many files were matched. Returning only the names.`);

    const fileNames = Array.from(results.keys()).sort();

    return `
The file search operation matched ${results.size} files, which is higher than the user specified limit of ${options.maxSnippetCount}.
The list of matched files will be returned as a directory listing instead.

BEGIN DIRECTORY LISTING
${fileNames.map(f => `- ${f}`).join("\n")}
END DIRECTORY LISTING
`.trim();
  }


  return Array.from(results.values()).join("\n\n");
}

const description = `
Search for text patterns in files. Supports searching across all files or within specific files.
- The search will be run inside the root folder the user has designated for the project
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- Searches are OR-based across multiple patterns (any match counts).
- The search system will automatically decide whether to return complete file contents, directory listings, or grep-style file/line snippets based on the number of matches.
`.trim();

const inputSchema = z
  .object({
    searches: z
      .array(z.string())
      .describe(
        "List of search terms to search for. Search terms can either by plain strings, which will be matched by a fuzzy substring search, or regex, if enclosed in '/'. Examples: \"searchTerm\", \"/searchTerm.*/\""
      ),
    files: z
      .array(z.string())
      .describe(
        "List of file paths or glob patterns to search within. Omit to search across all files in the project directory. Examples: \"**/*.ts\", \"path/to/file.txt\")",
      )
      .default(["**/*"])
  })
  .strict();

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

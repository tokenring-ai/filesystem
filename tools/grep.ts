import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

const name = "file_grep";
const displayName = "Filesystem/grep";

async function execute(
  {filePaths, searchTerms}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const matchedFiles = new Set<string>();
  for (const filePattern of filePaths) {
    for (const file of await fileSystem.glob(filePattern, {}, agent)) {
      matchedFiles.add(file);
    }
  }

  if (matchedFiles.size === 0) {
    return `No files were found that matched the search criteria`;
  }

  const options = agent.getState(FileSystemState).fileGrep;

  const retrievedFiles = new Map<string, string>();
  for (const file of matchedFiles) {
    try {
      const stat = await fileSystem.stat(file, agent);
      if (stat.exists) {
        if (stat.isDirectory) {
          for await (const dirFile of fileSystem.getDirectoryTree(
            file,
            {},
            agent,
          )) {
            if (retrievedFiles.has(dirFile)) break;
            const contents = await fileSystem.readTextFile(file, agent);
            if (contents) retrievedFiles.set(file, contents);
            else agent.infoMessage(`[${name}] Couldn't read file ${file}`);
          }
        } else {
          const contents = await fileSystem.readTextFile(file, agent);
          if (contents) retrievedFiles.set(file, contents);
          else agent.infoMessage(`[${name}] Couldn't read file ${file}`);
        }
      }
    } catch (err: any) {
      agent.infoMessage(`[${name}] Error reading file ${file}: ${err.message}`);
    }
  }

  const searchPatterns = searchTerms.map((s) => {
    if (s.startsWith("/") && s.endsWith("/")) {
      return new RegExp(s.slice(1, -1), "si");
    } else {
      return s.toLowerCase();
    }
  });

  const results = new Map<string, string>();

  for (const [file, fileContent] of retrievedFiles.entries()) {
    const lines = fileContent.split("\n");
    const lowerCaseLines = lines.map((l) => l.toLowerCase());

    const matchedLines = new Set<number>();
    for (const pattern of searchPatterns) {
      if (typeof pattern === "string") {
        for (let i = 0; i < lowerCaseLines.length; i++) {
          if (lowerCaseLines[i].includes(pattern)) matchedLines.add(i);
        }
      } else {
        pattern.lastIndex = 0;
        let result: RegExpExecArray | null = null;
        while ((result = pattern.exec(fileContent))) {
          const prefix = fileContent.substring(0, result.length - 1);
          const lineNumber = prefix.split("\n").length - 1;
          matchedLines.add(lineNumber);
        }
      }
    }

    for (const lineNumber of Array.from(matchedLines.values())) {
      for (
        let i = lineNumber - options.snippetLinesBefore;
        i < lineNumber + options.snippetLinesAfter;
        i++
      ) {
        if (i >= 0 && i < lines.length) matchedLines.add(i);
      }
    }

    if (matchedLines.size === 0) continue;

    if (results.size > options.maxSnippetCount) {
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
      if (
        snippetString.length >
        fileContent.length * options.maxSnippetSizePercent
      ) {
        results.set(
          file,
          `BEGIN FILE ATTACHMENT: ${file}\n${fileContent}\nEND FILE ATTACHMENT`,
        );
        continue;
      }
      results.set(
        file,
        `BEGIN FILE GREP MATCHES: ${file} (line: match)\n${snippets.join("\n")}\nEND FILE GREP MATCHES`,
      );
    }
  }

  if (results.size > options.maxSnippetCount) {
    agent.infoMessage(
      `[${name}] Too many files were matched. Returning only the names.`,
    );
    const fileNames = Array.from(results.keys()).sort();
    return `
The grep operation matched ${results.size} files, which is higher than the user specified limit of ${options.maxSnippetCount}.
The list of matched files will be returned as a directory listing instead.

BEGIN DIRECTORY LISTING
${fileNames.map((f) => `- ${f}`).join("\n")}
END DIRECTORY LISTING
`.trim();
  }

  return Array.from(results.values()).join("\n\n");
}

const description = `
Search for text patterns within files. Supports plain string and regex patterns.
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- Searches are OR-based across multiple patterns (any match counts).
- Automatically returns complete file contents, directory listings, or grep-style snippets based on match count.
`.trim();

const inputSchema = z
  .object({
    filePaths: z
      .array(z.string())
      .describe(
        'List of file paths or glob patterns to search within. Examples: "**/*.ts", "path/to/file.txt"',
      )
      .default(["**/*"]),
    searchTerms: z
      .array(z.string())
      .describe(
        'List of search terms. Plain strings use fuzzy substring match; wrap in \'/\' for regex. Examples: "searchTerm", "/searchTerm.*/"',
      ),
  })
  .strict();

function adjustActivation(
  enabled: boolean,
  agent: Agent,
): boolean | Promise<boolean> {
  const supportsGrep = agent
    .requireServiceByType(FileSystemService)
    .supportsGrep(agent);
  return enabled && supportsGrep;
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

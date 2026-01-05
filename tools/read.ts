import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

const name = "file_read";

async function execute(
  {
    files,
  }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const fileSystem = agent.requireServiceByType(FileSystemService);
  const { maxFileReadCount } = agent.getState(FileSystemState).fileRead;

  let matchedFiles = new Set<string>();

  // Handle glob patterns in files array
  for (let filePattern of files) {
    try {
      // Paths are relative to the filesystem root
      if (filePattern.startsWith('/')) filePattern = filePattern.substring(1);
      if (filePattern.includes("*") || filePattern.includes("?")) {
        for (const matchedFile of await fileSystem.glob(filePattern, { includeDirectories: true }, agent)) {
          matchedFiles.add(matchedFile);
        }
      } else {
        matchedFiles.add(filePattern);
      }
    } catch (err: any) {
      // Treat pattern resolution errors as informational
      agent.infoLine(
        `[${name}] Error resolving pattern ${filePattern}: ${err.message}`,
      );
    }
  }

  agent.infoLine(`[${name}] files=${files.join(", ")} matchedFiles=${matchedFiles.size}`);

  if (matchedFiles.size === 0) {
    return `No files were found that matched the search criteria`;
  }

  const retrievedFiles = new Map<string, string>();
  for (const file of matchedFiles) {
    try {
      const stat = await fileSystem.stat(file, agent);
      if (stat.isDirectory) {
        for await (const dirFile of fileSystem.getDirectoryTree(file, {}, agent)) {
          if (retrievedFiles.has(dirFile)) break;
          const contents = await fileSystem.readTextFile(file, agent);
          if (contents) retrievedFiles.set(file,contents);
          else agent.infoLine(`[${name}] Couldn't read file ${file}`)
        }
      } else {
        const contents = await fileSystem.readTextFile(file, agent);
        if (contents) retrievedFiles.set(file,contents);
        else agent.infoLine(`[${name}] Couldn't read file ${file}`)
      }
    } catch (err: any) {
      agent.infoLine(
        `[${name}] Error reading file ${file}: ${err.message}`,
      );
    }
  }

  if (retrievedFiles.size > maxFileReadCount) {
    agent.infoLine(`[${name}] Too many files were matched. Returning only the names.`);

    const fileNames = Object.keys(retrievedFiles).sort();

    return `
The file read operation matched ${retrievedFiles.size} files, which is higher than the user specified limit of ${maxFileReadCount}.
The list of matched files will be returned as a directory listing instead. To retrieve the files, you will need to request no more than ${maxFileReadCount} files at a time

>> BEGIN DIRECTORY LISTING <<
${fileNames.map(f => `- ${f}`).join("\n")}
>> END DIRECTORY LISTING <<
`.trim();
  }

  agent.mutateState(FileSystemState, (state: FileSystemState) => {
    for (const fileName of retrievedFiles.keys()) {
      state.readFiles.add(fileName);
    }
  });

  return `
The file read operation matched ${retrievedFiles.size} files, the file contents are provided below, between the BEGIN|END FILE ATTACHMENT block headers
  
${Array.from(retrievedFiles.entries()).map(([file, contents]) => 
    `BEGIN FILE ATTACHMENT: ${file}\n${contents}\nEND FILE ATTACHMENT`
  ).join('\n\n')}
`.trim();
}

const description = `
Read files from the filesystem. Retrieves file contents based on file paths or glob patterns.
- The filesystem scope is the entire sandboxed root directory accessible by the FileSystemService (e.g., the project's root folder).
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
`.trim();

const inputSchema = z
  .object({
    files: z
      .array(z.string())
      .describe(
        "List of file paths or glob patterns (e.g., '**/*.ts', 'path/to/file.txt').",
      )
  })
  .strict();

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

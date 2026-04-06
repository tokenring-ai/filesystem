import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

const name = "glob";
const displayName = "Filesystem/glob";

async function execute(
  {filePaths}: z.output<typeof inputSchema>,
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
    return `No files were found that matched the glob patterns`;
  }

  const fileNames = Array.from(matchedFiles).sort();
  return `BEGIN DIRECTORY LISTING\n${fileNames.map(f => `- ${f}`).join("\n")}\nEND DIRECTORY LISTING`;
}

const description = `
List files matching glob patterns relative to the project root folder.
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
`.trim();

const inputSchema = z
  .object({
    filePaths: z
      .array(z.string())
      .describe(
        "List of glob patterns to match files. Examples: \"**/*.ts\", \"path/to/file.txt\"",
      )
      .default(["**/*"]),
  })
  .strict();

export default {
  name, displayName, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import path from "path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

const name = "file_append";

async function execute(
  {
    path: filePath,
    content
  }: z.infer<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  if (!filePath) {
    throw new Error(`[${name}] 'path' parameter is required`);
  }
  if (!content) {
    throw new Error(
      `[${name}] 'content' parameter is required`,
    );
  }

  agent.infoLine(
    `[${name}] Appending to file ${filePath}`,
  );

  // Ensure parent directory exists
  const dirPath = path.dirname(filePath);
  if (dirPath !== "." && dirPath !== "/") {
    await fileSystem.createDirectory(dirPath, {recursive: true}, agent);
  }

  // Use appendFile instead of writeFile
  let success = await fileSystem.appendFile(filePath, content, agent);

  return `Successfully appended to file`;
}

const description = "Appends content to the end of an existing file. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the content to be appended to the file";

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file to append to (e.g., 'logs/app.log' or 'notes.md').",
    ),
  content: z
    .string()
    .describe(
      "The content to add to the end of the file.",
    ),
});

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
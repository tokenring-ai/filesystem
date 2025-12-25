import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import path from "path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

// Tool name export as required
const name = "file_write";

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

  // Informational messages use the tool name
  agent.infoLine(
    `[${name}] Modifying file ${filePath}`,
  );


  // Ensure parent directory exists
  const dirPath = path.dirname(filePath);
  if (dirPath !== "." && dirPath !== "/") {
    await fileSystem.createDirectory(dirPath, {recursive: true}, agent);
  }
  let success = await fileSystem.writeFile(filePath, content, agent);

  return `File successfully written`;

}

const description = "Writes a file to the filesystem. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the ENTIRE content of the file";

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file to write (e.g., 'src/main.ts' or 'docs/design.md'). Starts from the project root directory. Required.",
    ),
  content: z
    .string()
    .describe(
      "Content to write to the file. ALWAYS include the ENTIRE file contents to avoid data loss.",
    ),
});

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

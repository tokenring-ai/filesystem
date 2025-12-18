import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import path from "path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

// Tool name export as required
const name = "file/modify";

async function execute(
  {
    path: filePath,
    content,
    append
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
        await fileSystem.createDirectory(dirPath, {recursive: true});
      }
      // Write or append
      let success: boolean;
      if (append) {
        success = await fileSystem.appendFile(filePath, content);
      } else {
        success = await fileSystem.writeFile(filePath, content);
      }

      if (success) {
        fileSystem.setDirty(true);
      }

      return `File successfully ${append ? "appended; to" : "written"}`

}

const description =
  "Manage files in a virtual filesystem: write (create/overwrite), append, delete, rename, or adjust properties (currently permissions only). Paths are relative to the virtual root (e.g., './file.txt' or '/docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8) or base64-encoded binary. Always provide entire content for 'write'; partial for 'append'.";

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file to operate on (e.g., 'src/main.ts' or '/docs/design.md'). Starts from the project root directory. Required.",
    ),
  content: z
    .string()
    .describe(
      "Content for 'write' or 'append'. For 'write', ALWAYS include ENTIRE file contents to avoid data loss. For binary, use base64 and set 'is_base64'. Optional for non-content actions.",
    ),
  append: z.boolean().describe("Append content to the file instead of overwriting file?"),
});

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

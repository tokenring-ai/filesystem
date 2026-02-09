import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition, type TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {createPatch} from "diff";
import mime from "mime-types";
import path from "path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

// Tool name export as required
const name = "file_write";
const displayName = "Filesystem/write";

async function execute(
  {
    path: filePath,
    content
  }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const curFileContents = await fileSystem.readTextFile(filePath, agent)

  const state = agent.getState(FileSystemState);
  if (curFileContents && state.fileWrite.requireReadBeforeWrite && !state.readFiles.has(filePath)) {
    agent.mutateState(FileSystemState, (state) => {
      state.readFiles.add(filePath);
    });
    return `
Cannot write to ${filePath}: The tool policy requires that all files must be read before they can be written.

To expedite this process, we have read the file, and included the file contents below, and marked it as read, so that it can now be written.
It is not required that you re-read the file. Verify the file contents below and the changes you would like to make, and re-submit the file_write tool call to write the file.

${filePath}:\n\n
${curFileContents}`.trim();
  }

  agent.infoMessage(
    `[${name}] Modifying file ${filePath}`,
  );


  // Ensure parent directory exists
  const dirPath = path.dirname(filePath);
  if (dirPath !== "." && dirPath !== "/") {
    await fileSystem.createDirectory(dirPath, {recursive: true}, agent);
  }

  let success = await fileSystem.writeFile(filePath, content, agent);

  agent.mutateState(FileSystemState, (state: FileSystemState) => {
    state.readFiles.add(filePath);
  });

  if (curFileContents) {
    const diff = createPatch(filePath, curFileContents, content);

    return {
      type: "text",
      text: diff.length <= state.fileWrite.maxReturnedDiffSize
        ? `File successfully written. Changes made:\n${diff}`
        :  "File successfully overwritten.",
      artifact: {
        name: filePath,
        encoding: "text",
        mimeType: "text/x-diff",
        body: diff
      }
    }
  }

  return {
    type: "text",
    text: "File successfully created.",
    artifact: {
      name: filePath,
      encoding: "text",
      mimeType: mime.lookup(filePath) || "text/plain",
      body: content
    }
  };
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
  name, displayName, description, inputSchema, execute
} satisfies TokenRingToolDefinition<typeof inputSchema>;

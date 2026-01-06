import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {createPatch} from "diff";
import mime from "mime-types";
import path from "path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

const name = "file_append";

async function execute(
  {
    path: filePath,
    content
  }: z.output<typeof inputSchema>,
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
  let curFileContents = await fileSystem.readTextFile(filePath, agent)

  const state = agent.getState(FileSystemState);
  if (curFileContents && state.fileWrite.requireReadBeforeWrite && !state.readFiles.has(filePath)) {
    agent.mutateState(FileSystemState, (state) => {
      state.readFiles.add(filePath);
    })

    return `
Cannot append to ${filePath}: The tool policy requires that all files must be read before they can be written.

To expedite this process, we have read the file, and included the file contents below, and marked it as read, so that it can now be written.
It is not required that you re-read the file. Verify the file contents below and the changes you would like to make, and re-submit the file_append tool call to write the file.

${filePath}:\n\n
${curFileContents}`.trim();
  }

  agent.infoLine(
    `[${name}] Appending to file ${filePath}`,
  );

  // Ensure parent directory exists
  const dirPath = path.dirname(filePath);
  if (dirPath !== "." && dirPath !== "/") {
    await fileSystem.createDirectory(dirPath, {recursive: true}, agent);
  }

  let newFileContents = curFileContents ?? "";
  if (!newFileContents.endsWith("\n")) {
    newFileContents += "\n";
  }
  newFileContents += content;

  let success = await fileSystem.writeFile(filePath, newFileContents, agent);

  if (curFileContents) {
    const diff = createPatch(filePath, curFileContents, newFileContents);
    agent.artifactOutput({
      name: filePath,
      encoding: "text",
      mimeType: "text/x-diff",
      body: diff
    });

    return "File successfully appended to.";
  }

  agent.artifactOutput({
    name: filePath,
    encoding: "text",
    mimeType: mime.lookup(filePath) || "text/plain",
    body: content
  });

  return `File successfully created."`;
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
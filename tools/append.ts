import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingToolDefinition, TokenRingToolResult,} from "@tokenring-ai/chat/schema";
import path from "node:path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import createFileWriteResult from "../util/createFileWriteResult.ts";
import runFileValidator from "../util/runFileValidator.ts";

const name = "file_append";
const displayName = "Filesystem/append";

async function execute(
  {path: filePath, content}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  if (!filePath) {
    throw new Error(`[${name}] 'path' parameter is required`);
  }
  if (!content) {
    throw new Error(`[${name}] 'content' parameter is required`);
  }
  const curFileContents = await fileSystem.readTextFile(filePath, agent);
  const fileModificationTime = await fileSystem.getModifiedTimeNanos(
    filePath,
    agent,
  );

  const state = agent.getState(FileSystemState);
  const previouslyReadTime = state.readFiles.get(filePath) ?? 0;
  if (curFileContents && state.fileWrite.requireReadBeforeWrite) {
    if (fileModificationTime === null) {
      agent.infoMessage(
        `[${name}] Could not get the modification time for file ${filePath}: Cannot enforce read before write policy`,
      );
    } else if (fileModificationTime > previouslyReadTime) {
      agent.mutateState(FileSystemState, (state) => {
        state.readFiles.set(filePath, fileModificationTime);
      });

      return `
Cannot append to ${filePath}: The tool policy requires that all files must be read before they can be written.

To expedite this process, we have read the file, and included the file contents below, and marked it as read, so that it can now be written.
It is not required that you re-read the file. Verify the file contents below and the changes you would like to make, and re-submit the file_append tool call to write the file.

${filePath}:\n\n

${curFileContents}`.trim();
    }
  }

  agent.infoMessage(`[${name}] Appending to file ${filePath}`);

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

  await fileSystem.writeFile(filePath, newFileContents, agent);

  agent.mutateState(FileSystemState, (state: FileSystemState) => {
    state.readFiles.set(filePath, Date.now());
  });

  const validationSuffix = await runFileValidator(
    filePath,
    newFileContents,
    agent,
  );
  return createFileWriteResult(
    filePath,
    curFileContents,
    newFileContents,
    state.fileWrite.maxReturnedDiffSize,
    validationSuffix,
  );
}

const description =
  "Appends content to the end of an existing file. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the content to be appended to the file";

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file to append to (e.g., 'logs/app.log' or 'notes.md').",
    ),
  content: z.string().describe("The content to add to the end of the file."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

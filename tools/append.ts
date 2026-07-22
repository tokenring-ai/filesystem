import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import createFileWriteResult from "../util/createFileWriteResult.ts";
import runFileValidator from "../util/runFileValidator.ts";

const name = "file_append";
const displayName = "Filesystem/append";

async function execute({ path: filePath, content }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  if (!filePath) {
    throw new ToolCallError(name, `'path' parameter is required`);
  }
  if (!content) {
    throw new ToolCallError(name, `'content' parameter is required`);
  }
  const curFileContents = await fileSystem.readTextFile(filePath, agent);
  const fileModificationTime = await fileSystem.getModifiedTimeNanos(filePath, agent);

  const { settings, readFiles } = agent.getState(FileSystemState);
  const previouslyReadTime = readFiles.get(filePath) ?? 0;
  if (curFileContents && settings.requireReadBeforeWrite) {
    if (fileModificationTime === null) {
      agent.infoMessage(`[${name}] Could not get the modification time for file ${filePath}: Cannot enforce read before write policy`);
    } else if (fileModificationTime > previouslyReadTime) {
      agent.mutateState(FileSystemState, state => {
        state.readFiles.set(filePath, fileModificationTime);
      });

      return {
        failed: true,
        message: `**File Append** Couldn't append to ${filePath} (precondition: file not previously read)`,
        result: `
Cannot append to ${filePath}: The tool policy requires that all files must be read before they can be written.

To expedite this process, we have read the file, and included the file contents below, and marked it as read, so that it can now be written.
It is not required that you re-read the file. Verify the file contents below and the changes you would like to make, and re-submit the file_append tool call to write the file.

${filePath}:\n\n

${curFileContents}`.trim(),
      };
    }
  }

  // Ensure parent directory exists
  const dirPath = path.dirname(filePath);
  if (dirPath !== "." && dirPath !== "/") {
    await fileSystem.createDirectory(dirPath, { recursive: true }, agent);
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

  const validationSuffix = settings.validateWrittenFiles ? await runFileValidator(filePath, newFileContents, agent) : null;

  return createFileWriteResult(
    filePath,
    curFileContents,
    newFileContents,
    settings.maxReturnedDiffSize,
    validationSuffix,
    `**File Append** Appended to ${filePath}`,
  );
}

const description =
  "Appends content to the end of an existing file. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the content to be appended to the file";

const inputSchema = z.object({
  path: z.string().describe("Relative path of the file to append to (e.g., 'logs/app.log' or 'notes.md')."),
  content: z.string().describe("The content to add to the end of the file."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

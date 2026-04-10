import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingToolDefinition, TokenRingToolResult,} from "@tokenring-ai/chat/schema";
import path from "node:path";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";
import createFileWriteResult from "../util/createFileWriteResult.ts";
import runFileValidator from "../util/runFileValidator.ts";

// Tool name export as required
const name = "file_write";
const displayName = "Filesystem/write";

async function execute(
  {path: filePath, content}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

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
Cannot write to ${filePath}: The tool policy requires that all files must be read before they can be written.

To expedite this process, we have read the file, and included the file contents below, and marked it as read, so that it can now be written.
It is not required that you re-read the file. Verify the file contents below and the changes you would like to make, and re-submit the file_append tool call to write the file.

${filePath}:\n\n

${curFileContents}`.trim();
    }
  }

  // Ensure parent directory exists
  const dirPath = path.dirname(filePath);
  if (dirPath !== "." && dirPath !== "/") {
    await fileSystem.createDirectory(dirPath, {recursive: true}, agent);
  }

  await fileSystem.writeFile(filePath, content, agent);

  agent.mutateState(FileSystemState, (state: FileSystemState) => {
    state.readFiles.set(filePath, Date.now());
  });

  const validationSuffix = state.fileWrite.validateWrittenFiles
    ? await runFileValidator(filePath, content, agent)
    : "";
  return createFileWriteResult(
    filePath,
    curFileContents,
    content,
    state.fileWrite.maxReturnedDiffSize,
    validationSuffix,
  );
}

const description =
  "Writes a file to the filesystem. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the ENTIRE content of the file";

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

const requiredContextHandlers = ["selected-files"];

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  requiredContextHandlers,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

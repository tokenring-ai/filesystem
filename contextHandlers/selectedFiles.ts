import {type ContextHandlerOptions, ContextItem} from "@tokenring-ai/chat/schema";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

export default async function* getContextItems({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const fileContents: string[] = [];
  const directoryContents: string[] = [];
  for (const filePath of agent.getState(FileSystemState).selectedFiles) {
    const fileModificationTime = await fileSystem.getModifiedTimeNanos(filePath, agent);

    const content = await fileSystem.readTextFile(filePath, agent);
    if (content) {
      fileContents.push(`BEGIN FILE ATTACHMENT: ${filePath}\n${content}\nEND FILE ATTACHMENT: ${filePath}`);
      if (fileModificationTime === null) {
        agent.infoMessage(`[FileSystemService] Could not get the modification time for file ${filePath}: Cannot enforce read before write policy`);
      } else {
        agent.mutateState(FileSystemState, (state) => {
          state.readFiles.set(filePath, fileModificationTime);
        });
      }
    } else {
      try {
        const directoryListing = await fileSystem.getDirectoryTree(filePath, {}, agent);

        const files = await Array.fromAsync(directoryListing);

        directoryContents.push(`BEGIN DIRECTORY LISTING:\n${filePath}\n${files.map(f => `- ${f}`).join("\n")}\nEND DIRECTORY LISTING`);
      } catch (error) {
        // The file does not exist, or is not a directory
      }
    }
  }

  if (fileContents.length > 0) {
    yield {
      role: "user",
      content: `// The user has attached the following files:\n\n${fileContents.join("\n\n")}`,
    }
  }

  if (directoryContents.length > 0) {
    yield {
      role: "user",
      content: `// The user has attached the following directory listing:\n\n${directoryContents.join("\n\n")}`,
    }
  }
}

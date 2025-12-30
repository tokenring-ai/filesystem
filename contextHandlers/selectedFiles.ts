import Agent from "@tokenring-ai/agent/Agent";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/schema";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

export default async function * getContextItems(input: string, chatConfig: ChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const fileSystemService = agent.requireServiceByType(FileSystemService);

  const fileContents: string[] = [];
  const directoryContents: string[] = [];
  for (const file of agent.getState(FileSystemState).selectedFiles) {
    const content = await fileSystemService.getFile(file, agent);
    if (content) {
      fileContents.push(`BEGIN FILE ATTACHMENT: ${file}\n${content}\nEND FILE ATTACHMENT: ${file}`);
      agent.mutateState(FileSystemState, (state: FileSystemState) => {
        state.readFiles.add(file);
      });
    } else {
      try {
        const directoryListing = await fileSystemService.getDirectoryTree(file, {}, agent);

        const files = await Array.fromAsync(directoryListing);

        directoryContents.push(`BEGIN DIRECTORY LISTING:\n${file}\n${files.map(f => `- ${f}`).join("\n")}\nEND DIRECTORY LISTING`);
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

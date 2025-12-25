import Agent from "@tokenring-ai/agent/Agent";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/types";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

export default async function * getContextItems(input: string, chatConfig: ChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const fileSystemService = agent.requireServiceByType(FileSystemService);

  const fileContents: string[] = [];
  const directoryContents: string[] = [];
  for (const file of agent.getState(FileSystemState).selectedFiles) {
    const content = await fileSystemService.getFile(file, agent);
    if (content) {
      fileContents.push(`${file}:\n\n${content}`);
    } else {
      try {
        const directoryListing = await fileSystemService.getDirectoryTree(file, {}, agent);

        const files = await Array.fromAsync(directoryListing);

        directoryContents.push(`${file}:\n${files.map(f => `- ${f}`).join("\n")}`);
      } catch (error) {
        // The file does not exist, or is not a directory
      }
    }
  }

  if (fileContents.length > 0) {
    yield {
      role: "user",
      content: `// The user has provided the contents of the following files:\n\n${fileContents.join("\n\n\n")}`,
    }
  }

  if (directoryContents.length > 0) {
    yield {
      role: "user",
      content: `// The user has provided file listings for the following directories:\n\n${directoryContents.join("\n\n\n")}`,
    }
  }
}

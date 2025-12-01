import Agent from "@tokenring-ai/agent/Agent";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/types";
import FileSystemService from "../FileSystemService.ts";
import {FileSystemState} from "../state/fileSystemState.ts";

export default async function * getContextItems(input: string, chatConfig: ChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
  for (const file of agent.getState(FileSystemState).selectedFiles) {
    const content = await fileSystemService.getFile(file);
    yield {
      role: "user",
      content: `// ${file}\n${content}`,
    };
  }
}

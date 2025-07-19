import ChatService from "@token-ring/chat/ChatService";
import runChat from "@token-ring/ai-client/runChat";
import FileSystemService from "../FileSystemService.js";
import {ChatMessageStorage} from "@token-ring/ai-client";

/**
 * /foreach <globString> <prompt ...> - Run a prompt on each file matching the globString
 */

  export const description = "/foreach <globString> <prompt ...> - Run a prompt on each file matching the globString.";

  export async function execute(remainder, registry) {
    const chatService = registry.requireFirstServiceByType(ChatService);
    const fileSystem = registry.requireFirstServiceByType(FileSystemService);

    if (!remainder || !remainder.trim()) {
      chatService.errorLine("Usage: /foreach <globString> <prompt ...>");
      return;
    }

    if (!fileSystem) {
      chatService.errorLine("FileSystem not found. Please add it to your context configuration.");
      return;
    }

    if (!fileSystem) {
      chatService.errorLine("FileSystem not found. Please add it to your context configuration.");
      return;
    }

    const firstSpaceIndex = remainder.indexOf(' ');
    if (firstSpaceIndex === -1) {
      chatService.errorLine("Usage: /foreach <globString> <prompt ...>");
      return;
    }

    const globString = remainder.substring(0, firstSpaceIndex).trim();
    const prompt = remainder.substring(firstSpaceIndex + 1).trim();

    if (!globString || !prompt) {
      chatService.errorLine("Usage: /foreach <globString> <prompt ...>");
      return;
    }

    // Use FileSystem's glob to find matching files
    let files = await fileSystem.glob(globString, { absolute: true});

    if (files.length === 0) {
      chatService.systemLine(`No files matched the pattern: ${globString}`);
      return;
    }

    for (const file of files) {
     try {
      chatService.systemLine(`Running prompt on file: ${file}`);
      await runPromptOnFile(file, prompt, registry);
     } catch (error) {
      chatService.errorLine(`Error running prompt on file ${file}:`, error);
     }
    }
  }

export function help() {
 return [
  "/foreach <globString> <prompt ...>",
  "  - Run a prompt on each file matching the globString",
  "  - Example: /foreach *.js \"Add error handling\""
 ];
}

async function runPromptOnFile(filePath, prompt, registry) {
 const systemPrompt = `Retrieve the file ${filePath} with the getFiles tool. Then modify the code in the file, based on the user prompt that follows, and then write out the file using the createFile command, and print a one sentence summary of the changes made to the file.`;

 const chatService = registry.requireFirstServiceByType(ChatService);
 const chatMessageStorage = registry.requireFirstServiceByType(ChatMessageStorage);

 const currentMessage = chatMessageStorage.getCurrentMessage();
 chatMessageStorage.setCurrentMessage(null);
 //chatService.resetAbortController();

 await runChat({
  systemPrompt,
  input: prompt,
  model: chatService.getModel()
 }, registry);

 //chatService.clearAbortController();
 chatMessageStorage.setCurrentMessage(currentMessage);
}

import Agent from "@tokenring-ai/agent/Agent";
import runChat from "@tokenring-ai/ai-client/runChat";
import FileSystemService from "../FileSystemService.ts";

/**
 * /foreach <globString> <prompt ...> - Run a prompt on each file matching the globString
 */

export const description: string =
  "/foreach <globString> <prompt ...> - Run a prompt on each file matching the globString.";

export async function execute(remainder: string, agent: Agent) {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  if (!remainder || !remainder.trim()) {
    agent.errorLine("Usage: /foreach <globString> <prompt ...>");
    return;
  }

  const firstSpaceIndex = remainder.indexOf(" ");
  if (firstSpaceIndex === -1) {
    agent.errorLine("Usage: /foreach <globString> <prompt ...>");
    return;
  }

  const globString = remainder.substring(0, firstSpaceIndex).trim();
  const prompt = remainder.substring(firstSpaceIndex + 1).trim();

  if (!globString || !prompt) {
    agent.errorLine("Usage: /foreach <globString> <prompt ...>");
    return;
  }

  // Use FileSystem's glob to find matching files
  const files: string[] = await fileSystem.glob(globString, {absolute: true});

  if (files.length === 0) {
    agent.infoLine(`No files matched the pattern: ${globString}`);
    return;
  }


  const checkPoint = agent.generateCheckpoint()

  try {
    for (const file of files) {
      try {
        agent.infoLine(`Running prompt on file: ${file}`);

        await runChat(
          {
            input: `File: ${file}\n${prompt}`,
          },
          agent
        );
      } catch (error) {
        agent.errorLine(`Error running prompt on file ${file}:`, error as Error);
      }
      agent.restoreCheckpoint(checkPoint);
    }
  } finally {
    agent.restoreCheckpoint(checkPoint);
  }
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return [
    "/foreach <globString> <prompt ...>",
    "  - Run a prompt on each file matching the globString",
    '  - Example: /foreach *.js "Add error handling"',
  ];
}

import type { ChatInputMessage } from "@tokenring-ai/ai-client/client/AIChatClient";
import type { ContextHandlerOptions } from "@tokenring-ai/chat/schema";
import FileSystemService from "../FileSystemService.ts";

/**
 * Injects the workspace allow-list so the model knows which absolute paths the
 * filesystem and terminal tools accept. Declared by those tools via
 * `requiredContextHandlers: ["allowed-paths"]`.
 */
export default async function* allowedPaths({ agent }: ContextHandlerOptions): AsyncGenerator<ChatInputMessage> {
  const fileSystem = agent.requireService(FileSystemService);
  const entries = fileSystem.getAllowedPaths();

  yield {
    role: "user",
    content: [
      "The following directories are available to the filesystem and terminal tools.",
      "Use these absolute paths. Do not access paths outside this list.",
      ...entries.map(entry => `- \`${entry.path}\` (${entry.permission})${entry.description ? ` — ${entry.description}` : ""}`),
    ].join("\n"),
  };
}

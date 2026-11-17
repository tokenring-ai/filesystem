import type { ChatInputMessage } from "@tokenring-ai/ai-client/client/AIChatClient";
import type { ContextHandlerOptions } from "@tokenring-ai/chat/schema";
import RemoteStoreService from "./RemoteStoreService.ts";

/** Tells the model which remote mounts exist and that they are not part of the host filesystem. */
export default async function* remoteStores({ agent }: ContextHandlerOptions): AsyncGenerator<ChatInputMessage> {
  const mounts = agent.getService(RemoteStoreService)?.listMounts() ?? [];
  if (mounts.length === 0) return;
  yield {
    role: "user",
    content: [
      "These remote stores are available through the remote_* tools. They are NOT on the host filesystem:",
      "file, grep and terminal tools cannot see them. Copy a file to the host with remote_download to work on it there.",
      ...mounts.map(mount => `- \`${mount.url}\` — ${mount.label} (${mount.writable ? "read/write" : "read-only"})`),
    ].join("\n"),
  };
}

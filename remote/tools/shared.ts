import type Agent from "@tokenring-ai/agent/Agent";
import type { RemoteEntry } from "../RemoteStore.ts";
import RemoteStoreService from "../RemoteStoreService.ts";

/** Remote tools are offered only while at least one remote mount is configured. */
export function whenMountsExist(enabled: boolean, agent: Agent): boolean {
  return enabled && (agent.getService(RemoteStoreService)?.hasMounts() ?? false);
}

export function describeEntry(entry: RemoteEntry): string {
  const details = [
    entry.kind === "folder" ? "folder" : entry.readsAs ? `${entry.mimeType ?? "file"}, reads as ${entry.readsAs}` : entry.mimeType,
    entry.size !== undefined ? `${entry.size} bytes` : undefined,
    entry.modified ? `modified ${entry.modified}` : undefined,
  ].filter(Boolean);
  return `- ${entry.name}${entry.kind === "folder" ? "/" : ""} — ${entry.url}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
}

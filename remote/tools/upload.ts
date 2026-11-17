import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import mime from "mime-types";
import { z } from "zod";
import FileSystemService from "../../FileSystemService.ts";
import requireAbsolutePath from "../../util/requireAbsolutePath.ts";
import RemoteStoreService from "../RemoteStoreService.ts";
import { whenMountsExist } from "./shared.ts";

const name = "remote_upload";
const displayName = "Remote/upload";

/** Writes to shared cloud storage, possibly replacing a file (approval standard: shared change). */
const UPLOAD_SAFETY_LEVEL = 7;

async function execute({ path: rawPath, url, name: newName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const remote = agent.requireService(RemoteStoreService);
  const source = requireAbsolutePath(name, rawPath);
  const content = await agent.requireService(FileSystemService).readFile(source, agent);
  if (content === null) {
    return { failed: true, message: `**Remote Upload** ${source} not found`, result: `Cannot upload ${source}: the file does not exist.` };
  }

  const target = await remote.stat(url);
  if (!target) {
    return {
      failed: true,
      message: `**Remote Upload** ${url} not found`,
      result: `${url} does not exist. Pass a remote folder URL to create a file, or a file URL to replace it.`,
    };
  }
  const creating = target.kind === "folder";
  const fileName = newName ?? path.basename(source);
  const description = creating ? `Upload ${source} as "${fileName}" into ${target.name} (${url})?` : `Replace ${target.name} (${url}) with ${source}?`;

  const approved = await agent
    .requireService(ChatService)
    .checkToolApproval(
      { toolName: name, message: description, detailedDescription: "This changes a file outside the host.", safetyLevel: UPLOAD_SAFETY_LEVEL, default: false },
      agent,
    );
  if (!approved) return { failed: true, message: `**Remote Upload** Not approved`, result: `User did not approve: ${description}` };

  const mimeType = mime.lookup(fileName) || "application/octet-stream";
  const entry = creating ? await remote.create(url, fileName, content, mimeType) : await remote.update(url, content, mimeType);
  return {
    message: `**Remote Upload** ${source} → ${entry.name}`,
    result: `${creating ? "Created" : "Updated"} ${entry.name} (${entry.url}) from ${source}.`,
  };
}

const description = `
Copies a host file to a remote store (such as Google Drive or S3): pass a remote folder URL to create a new file there, or a remote file URL to replace its content.
The mount must allow writes. Replacing files in shared storage needs approval; depending on the user's settings a classifier may give it.
`.trim();

const inputSchema = z.object({
  path: z.string().describe("Absolute host path of the file to upload"),
  url: z.string().describe("Remote folder URL (creates a file) or remote file URL (replaces it)"),
  name: z.string().exactOptional().describe("Name for a new file; defaults to the host file's name"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  requiredContextHandlers: ["remote-stores", "allowed-paths"],
  adjustActivation: whenMountsExist,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

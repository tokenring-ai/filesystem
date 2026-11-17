import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import FileSystemService from "../../FileSystemService.ts";
import requireAbsolutePath from "../../util/requireAbsolutePath.ts";
import RemoteStoreService from "../RemoteStoreService.ts";
import { whenMountsExist } from "./shared.ts";

const name = "remote_download";
const displayName = "Remote/download";

async function execute({ url, path: rawPath, overwrite }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const target = requireAbsolutePath(name, rawPath);
  if (!overwrite && (await fileSystem.exists(target, agent))) {
    return {
      failed: true,
      message: `**Remote Download** ${target} already exists`,
      result: `${target} already exists on the host. Pick another path, or pass overwrite: true to replace it.`,
    };
  }
  const { name: fileName, mimeType, content } = await agent.requireService(RemoteStoreService).read(url);
  await fileSystem.writeFile(target, content, agent);
  return {
    message: `**Remote Download** ${fileName} → ${target}`,
    result: `Copied ${fileName} (${url}, ${mimeType}, ${content.length} bytes) to ${target} on the host. File, grep and terminal tools can use it now.`,
  };
}

const description = `
Copies a remote file (such as a Google Drive file or an S3 object) to the host filesystem, so the file, grep and terminal tools can work on it.
Google Docs are saved as Markdown and Sheets as CSV. The host path must be absolute and inside a writable allowed directory.
`.trim();

const inputSchema = z.object({
  url: z.string().describe("Remote file URL, e.g. 'googledrive://work/<fileId>'"),
  path: z.string().describe("Absolute host path to write, inside a writable allowed directory"),
  overwrite: z.boolean().default(false).describe("Replace the host file if it already exists"),
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

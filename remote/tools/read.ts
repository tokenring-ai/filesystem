import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import { isTextMimeType } from "../RemoteStore.ts";
import RemoteStoreService from "../RemoteStoreService.ts";
import { whenMountsExist } from "./shared.ts";

const name = "remote_read";
const displayName = "Remote/read";

/** Larger text is cut; the agent can copy the file to the host with remote_download instead. */
const MAX_TEXT_BYTES = 128 * 1024;

async function execute({ url }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const { name: fileName, mimeType, content } = await agent.requireService(RemoteStoreService).read(url);
  if (!isTextMimeType(mimeType)) {
    return {
      message: `**Remote Read** ${fileName} is ${mimeType}`,
      result: `${fileName} (${url}) is ${mimeType}, ${content.length} bytes, not text. Use remote_download to copy it to the host if you need to work with it.`,
    };
  }
  const truncated = content.length > MAX_TEXT_BYTES;
  return {
    message: `**Remote Read** ${fileName}`,
    result: [
      `${fileName} (${url}, ${mimeType}${truncated ? `, first ${MAX_TEXT_BYTES} of ${content.length} bytes` : ""}):`,
      "",
      content.subarray(0, MAX_TEXT_BYTES).toString("utf-8"),
      truncated ? "\n[Truncated. Use remote_download to copy the whole file to the host.]" : "",
    ].join("\n"),
  };
}

const description = `
Reads a file from a remote store (such as Google Drive or S3) by URL. Google Docs read as Markdown and Sheets as CSV.
To grep, edit or run anything on a remote file, copy it to the host with remote_download first.
`.trim();

const inputSchema = z.object({
  url: z.string().describe("Remote file URL from remote_list or remote_search, e.g. 'googledrive://work/<fileId>'"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  requiredContextHandlers: ["remote-stores"],
  adjustActivation: whenMountsExist,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;

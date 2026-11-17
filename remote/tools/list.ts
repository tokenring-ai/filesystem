import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import RemoteStoreService from "../RemoteStoreService.ts";
import { describeEntry, whenMountsExist } from "./shared.ts";

const name = "remote_list";
const displayName = "Remote/list";

async function execute({ url, cursor }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const { entries, cursor: next } = await agent.requireService(RemoteStoreService).list(url, { cursor });
  return {
    message: `**Remote List** ${url}: ${entries.length} entries`,
    result: [
      entries.length === 0 ? "The folder is empty." : entries.map(describeEntry).join("\n"),
      next ? `\nMore entries exist; call ${name} again with cursor "${next}".` : "",
    ].join(""),
  };
}

const description = `
Lists a folder in a remote store (such as Google Drive or S3). Remote stores are not on the host disk: use remote URLs, not paths.
Pass a mount's root URL (listed in your context) to start, then the URL of any folder in the results.
`.trim();

const inputSchema = z.object({
  url: z.string().describe("Remote folder URL, e.g. 'googledrive://work/' or 'googledrive://work/<folderId>'"),
  cursor: z.string().exactOptional().describe("Cursor from a previous call, to fetch the next page"),
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

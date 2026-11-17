import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import RemoteStoreService from "../RemoteStoreService.ts";
import { describeEntry, whenMountsExist } from "./shared.ts";

const name = "remote_search";
const displayName = "Remote/search";

async function execute({ query, within, limit }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const entries = await agent.requireService(RemoteStoreService).search(query, { within, limit });
  return {
    message: `**Remote Search** "${query}": ${entries.length} results`,
    result: entries.length === 0 ? `No remote files match "${query}".` : entries.map(describeEntry).join("\n"),
  };
}

const description = `
Searches remote stores by file name, using each store's own search. Google Drive also matches file contents; S3 matches key names only.
This does not search the host filesystem; use file_search / file_grep for that.
`.trim();

const inputSchema = z.object({
  query: z.string().describe("Words to look for in file names (and contents, where the store supports it)"),
  within: z.string().exactOptional().describe("Limit to one mount: any URL inside it, e.g. 'googledrive://work/'. Omit to search every mount."),
  limit: z.number().int().min(1).max(100).default(25).describe("Most results to return"),
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

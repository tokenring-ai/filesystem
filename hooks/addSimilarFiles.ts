import { AfterInputReceived } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { HookSubscription } from "@tokenring-ai/lifecycle/types";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import type { FileSearchMatch } from "../util/fileSearch.ts";
import { extractFileExtensions, extractKeywords, searchFiles } from "../util/fileSearch.ts";

const name = "addSimilarFiles";
const displayName = "Filesystem/Add similar files to chat";
const description = "Searches the filesystem for files relevant to the user's input and attaches the matching filenames and chunks to the chat message";

const MAX_RELATED_FILES = 5;

/**
 * Format search matches as a single markdown document of filenames and matching chunks.
 */
function formatRagResults(results: FileSearchMatch[], keywords: string[]): string {
  const lines: string[] = ["# RAG Filesystem Search Results", "", `Found ${results.length} file(s) matching: ${keywords.map(k => `\`${k}\``).join(", ")}`, ""];

  for (const result of results) {
    const matchTypeLabel = result.matchType === "both" ? "filename + content" : result.matchType;

    lines.push(`## \`${result.filePath}\` (${matchTypeLabel})`);

    if (result.lineMatches.length > 0) {
      lines.push("");
      for (const match of result.lineMatches.slice(0, 5)) {
        const trimmedContent = match.content.trim();
        lines.push(`- Line ${match.line}: ${trimmedContent}`);
      }
      if (result.lineMatches.length > 5) {
        lines.push(`- ... and ${result.lineMatches.length - 5} more matches`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function addSimilarFiles(data: AfterInputReceived, agent: Agent) {
  if (data.input.message.startsWith("/") && !data.input.message.match(/^\s*\/chat\s*send/)) return;

  const fileSystemService = agent.requireService(FileSystemService);

  // Returns true if the similar files were already injected
  if (
    agent.mutateState(FileSystemState, state => {
      if (state.hasInjectedSimilarFiles) return true;
      state.hasInjectedSimilarFiles = true;

      return false;
    })
  )
    return;

  const keywords = extractKeywords(data.input.message);
  if (keywords.length === 0) return;

  const extensions = extractFileExtensions(data.input.message);

  const results = await searchFiles(fileSystemService, keywords, extensions, MAX_RELATED_FILES, agent);

  if (results.length === 0) return;

  const markdown = formatRagResults(results, keywords);

  data.input.attachments = [
    ...(data.input.attachments ?? []),
    {
      name: "RAG Filesystem Search Results",
      description: `Related files and matching chunks for: ${keywords.join(", ")}`,
      encoding: "text",
      mimeType: "text/markdown",
      body: markdown,
    },
  ];
}

const callbacks = [new HookCallback(AfterInputReceived, addSimilarFiles)];

export default {
  name,
  displayName,
  description,
  callbacks,
} satisfies HookSubscription;

import { AfterInputReceived } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { HookSubscription } from "@tokenring-ai/lifecycle/types";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import type { FileSearchMatch } from "../util/fileSearch.ts";
import { extractFileExtensions, extractKeywords, searchFiles } from "../util/fileSearch.ts";

const name = "addRelatedFiles";
const displayName = "Filesystem/Add related files to chat";
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

async function addRAGFiles(data: AfterInputReceived, agent: Agent, fileSystemService: FileSystemService) {
  const { hasInjectedRelatedFiles } = agent.getState(FileSystemState);
  if (hasInjectedRelatedFiles) return;

  agent.mutateState(FileSystemState, state => {
    state.hasInjectedRelatedFiles = true;
  });

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

async function addSelectedFilesFromChat(data: AfterInputReceived, state: FileSystemState, agent: Agent, fileSystem: FileSystemService) {
  const attachments = (data.input.attachments ??= []);
  for (const filePath of state.selectedFiles) {
    if (state.readFiles.has(filePath)) continue;

    const fileModificationTime = await fileSystem.getModifiedTimeNanos(filePath, agent);

    const content = await fileSystem.readTextFile(filePath, agent);
    if (content) {
      attachments.push({
        name: filePath,
        description: `Attached file: ${filePath}`,
        encoding: "text",
        mimeType: "text/plain",
        body: content,
      });

      if (fileModificationTime === null) {
        agent.infoMessage(`[FileSystemService] Could not get the modification time for file ${filePath}: Cannot enforce read before write policy`);
      } else {
        agent.mutateState(FileSystemState, state => {
          state.readFiles.set(filePath, fileModificationTime);
        });
      }
    } else {
      try {
        const directoryListing = fileSystem.getDirectoryTree(filePath, {}, agent);

        const files = await Array.fromAsync(directoryListing);

        attachments.push({
          name: filePath,
          description: `Attached directory listing: ${filePath}`,
          encoding: "text",
          mimeType: "text/plain",
          body: `BEGIN DIRECTORY LISTING:\n${filePath}\n${markdownList(files, 2)}\nEND DIRECTORY LISTING`,
        });
      } catch {
        // The file does not exist, or is not a directory
      }
    }
  }
}

async function addRelatedFiles(data: AfterInputReceived, agent: Agent) {
  const fileSystemService = agent.requireServiceByType(FileSystemService);

  const state = agent.getState(FileSystemState);
  if (!state.hasInjectedRelatedFiles) {
    agent.mutateState(FileSystemState, state => {
      state.hasInjectedRelatedFiles = true;
    });
    await addRAGFiles(data, agent, fileSystemService);
  }

  await addSelectedFilesFromChat(data, state, agent, fileSystemService);
}

const callbacks = [new HookCallback(AfterInputReceived, addRelatedFiles)];

export default {
  name,
  displayName,
  description,
  callbacks,
} satisfies HookSubscription;

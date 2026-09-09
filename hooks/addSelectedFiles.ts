import { BeforeInputReceived } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { HookSubscription } from "@tokenring-ai/lifecycle/types";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";
import formatError from "@tokenring-ai/utility/error/formatError";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import directoryListing from "../util/directoryListing.ts";

const name = "addSelectedFiles";
const displayName = "Filesystem/Add selected files to chat";
const description = "Attaches mentioned or selected files to the chat message";

async function addSelectedFiles(data: BeforeInputReceived, agent: Agent) {
  if (data.input.message.startsWith("/") && !data.input.message.match(/^\s*\/chat\s*send/)) return;

  const fileSystem = agent.requireService(FileSystemService);
  const state = agent.getState(FileSystemState);

  const attachments = (data.input.attachments ??= []);
  const filePathsToAttach = new Set(state.selectedFiles);

  // Extract mentioned paths from input message (tokens containing '/')
  const mentionedMatches = data.input.message.match(/(?:@)?\S*\/\S*/g);
  if (mentionedMatches) {
    for (const match of mentionedMatches) {
      let cleanPath = match.startsWith("@") ? match.slice(1) : match;

      // Strip trailing punctuation that is likely part of surrounding
      // natural-language text rather than the actual file path
      // (e.g. "plugin/audio/, and ..." -> "plugin/audio/")
      cleanPath = cleanPath.replace(/[.,;:!?)\]}'"`]+$/, "");

      if (!cleanPath) continue;

      // Relative mentions (src/foo.ts) are probed across the allowed roots;
      // the first existing match wins. Absolute mentions pass through.
      const probed = await fileSystem.probeMentionedPath(cleanPath, agent);
      if (probed) filePathsToAttach.add(probed);
    }
  }

  for (const filePath of filePathsToAttach) {
    if (state.readFiles.has(filePath)) continue;

    try {
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
        agent.mutateState(FileSystemState, state => {
          state.readFiles.set(filePath, Date.now());
        });

        const files = await Array.fromAsync(fileSystem.getDirectoryTree(filePath, {}, agent));

        attachments.push({
          name: filePath,
          description: `Directory listing for ${filePath}`,
          encoding: "text",
          mimeType: "text/plain",
          body: directoryListing(filePath, files),
        });
      }
    } catch (err) {
      agent.warningMessage(`[${name}] Failed to attach file ${filePath}: ${formatError(err)}`);
    }
  }
}

const callbacks = [new HookCallback(BeforeInputReceived, addSelectedFiles)];

export default {
  name,
  displayName,
  description,
  callbacks,
} satisfies HookSubscription;

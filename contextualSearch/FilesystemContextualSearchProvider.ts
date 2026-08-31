import type Agent from "@tokenring-ai/agent/Agent";
import type { InputMessage } from "@tokenring-ai/agent/AgentEvents";
import type TokenRingApp from "@tokenring-ai/app";
import type { ContextualSearchItem, ContextualSearchProvider, ContextualSearchQuery } from "@tokenring-ai/chat/ContextualSearchProvider";
import { formatContextualTag } from "@tokenring-ai/chat/contextualSearch/tags";
import formatError from "@tokenring-ai/utility/error/formatError";
import type { FileSystemProvider } from "../FileSystemProvider.ts";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import directoryListing from "../util/directoryListing.ts";
import { listWorkspaceFiles } from "../util/workspaceFileIndex.ts";

const PROVIDER_ID = "file";
const CATEGORY_ID = "filesystems";
const CATEGORY_LABEL = "Filesystems";

export default class FilesystemContextualSearchProvider implements ContextualSearchProvider {
  readonly id = PROVIDER_ID;
  readonly categoryId = CATEGORY_ID;
  readonly categoryLabel = CATEGORY_LABEL;

  constructor(private readonly app: TokenRingApp) {}

  isAvailable(agent: Agent): boolean {
    const fileSystem = agent.getService(FileSystemService) ?? this.app.getService(FileSystemService);
    return !!fileSystem && fileSystem.getFilesystemProviderNames().length > 0;
  }

  async *search({ query, limit, agent, signal }: ContextualSearchQuery): AsyncGenerator<ContextualSearchItem[]> {
    const fileSystem = agent.getService(FileSystemService) ?? this.app.requireService(FileSystemService);
    const needle = query.trim().toLowerCase();
    const names = fileSystem.getFilesystemProviderNames();

    const tasks = names.map(providerName =>
      searchFilesystem(fileSystem, providerName, needle, limit).then(
        items => ({ providerName, items }),
        (error: unknown) => ({ providerName, error }),
      ),
    );

    const remaining = [...tasks];
    while (remaining.length > 0) {
      if (signal?.aborted) return;
      const finished = await Promise.race(remaining.map(task => task.then(result => ({ result, task }))));
      const index = remaining.indexOf(finished.task);
      if (index >= 0) void remaining.splice(index, 1);

      if ("error" in finished.result) {
        agent.warningMessage(
          `[FilesystemContextualSearchProvider] ${finished.result.providerName} failed: ${formatError(finished.result.error, { includeStack: false })}`,
        );
        continue;
      }
      if (finished.result.items.length > 0) {
        yield finished.result.items;
      }
    }
  }

  async resolve({ itemId }: { itemId: string }, input: InputMessage, agent: Agent): Promise<void> {
    const parsed = parseFileItemId(itemId);
    if (!parsed) return;

    const fileSystem = agent.getService(FileSystemService) ?? this.app.getService(FileSystemService);
    if (!fileSystem) return;

    const attachments = (input.attachments ??= []);
    if (attachments.some(attachment => attachment.name === parsed.filePath)) return;

    const state = agent.getState(FileSystemState);
    const readKey = `${parsed.providerName}:${parsed.filePath}`;
    if (state.readFiles.has(parsed.filePath) || state.readFiles.has(readKey)) return;

    try {
      if (state.providerName === parsed.providerName) {
        await attachViaService(fileSystem, parsed.filePath, attachments, agent);
        return;
      }

      const provider = fileSystem.requireFileSystemProviderByName(parsed.providerName);
      await attachViaProvider(provider, parsed.filePath, parsed.providerName, attachments, agent);
    } catch (error: unknown) {
      agent.warningMessage(`[FilesystemContextualSearchProvider] Failed to attach ${parsed.filePath}: ${formatError(error, { includeStack: false })}`);
    }
  }
}

async function searchFilesystem(fileSystem: FileSystemService, providerName: string, needle: string, limit: number): Promise<ContextualSearchItem[]> {
  const provider = fileSystem.requireFileSystemProviderByName(providerName);
  const files = await listWorkspaceFiles(providerName, provider, { ignoreFilter: () => false });
  return rankFiles(files, needle)
    .slice(0, limit)
    .map(filePath => ({
      id: `${providerName}:${filePath}`,
      tag: formatContextualTag(PROVIDER_ID, `${providerName}:${filePath}`),
      title: fileTitle(filePath),
      subtitle: `${providerName} · ${filePath}`,
      categoryId: CATEGORY_ID,
      categoryLabel: CATEGORY_LABEL,
      score: fileScore(filePath, needle),
    }));
}

function parseFileItemId(itemId: string): { providerName: string; filePath: string } | null {
  const separator = itemId.indexOf(":");
  if (separator <= 0 || separator === itemId.length - 1) return null;
  return { providerName: itemId.slice(0, separator), filePath: itemId.slice(separator + 1) };
}

function fileTitle(filePath: string): string {
  const trimmed = filePath.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

function fileDepth(filePath: string): number {
  return (filePath.match(/[/\\]/g) ?? []).length;
}

function fileScore(filePath: string, needle: string): number {
  let score = 1000 - fileDepth(filePath) * 10;
  if (!needle) return score;
  const base = fileTitle(filePath).toLowerCase();
  if (base.startsWith(needle)) score += 50;
  else if (base.includes(needle)) score += 20;
  else if (filePath.toLowerCase().includes(needle)) score += 5;
  return score;
}

function rankFiles(files: string[], needle: string): string[] {
  const matches = needle ? files.filter(filePath => filePath.toLowerCase().includes(needle)) : [...files];
  matches.sort((left, right) => {
    const depthDiff = fileDepth(left) - fileDepth(right);
    if (depthDiff !== 0) return depthDiff;
    const baseCmp = fileTitle(left).localeCompare(fileTitle(right), undefined, { numeric: true, sensitivity: "base" });
    if (baseCmp !== 0) return baseCmp;
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  });
  return matches;
}

async function attachViaService(fileSystem: FileSystemService, filePath: string, attachments: NonNullable<InputMessage["attachments"]>, agent: Agent) {
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
    agent.mutateState(FileSystemState, state => {
      state.readFiles.set(filePath, fileModificationTime ?? Date.now());
    });
    return;
  }

  const files = await Array.fromAsync(fileSystem.getDirectoryTree(filePath, {}, agent));
  attachments.push({
    name: filePath,
    description: `Directory listing for ${filePath}`,
    encoding: "text",
    mimeType: "text/plain",
    body: directoryListing(filePath, files),
  });
  agent.mutateState(FileSystemState, state => {
    state.readFiles.set(filePath, Date.now());
  });
}

async function attachViaProvider(
  provider: FileSystemProvider,
  filePath: string,
  providerName: string,
  attachments: NonNullable<InputMessage["attachments"]>,
  agent: Agent,
) {
  const content = await provider.readFile(filePath);
  if (content) {
    attachments.push({
      name: filePath,
      description: `Attached file: ${filePath}`,
      encoding: "text",
      mimeType: "text/plain",
      body: content.toString("utf-8"),
    });
    agent.mutateState(FileSystemState, state => {
      state.readFiles.set(`${providerName}:${filePath}`, Date.now());
    });
    return;
  }

  const files = await Array.fromAsync(provider.getDirectoryTree(filePath, { ignoreFilter: () => false }));
  attachments.push({
    name: filePath,
    description: `Directory listing for ${filePath}`,
    encoding: "text",
    mimeType: "text/plain",
    body: directoryListing(filePath, files),
  });
  agent.mutateState(FileSystemState, state => {
    state.readFiles.set(`${providerName}:${filePath}`, Date.now());
  });
}

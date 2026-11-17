import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { InputMessage } from "@tokenring-ai/agent/AgentEvents";
import type TokenRingApp from "@tokenring-ai/app";
import type { ContextualSearchItem, ContextualSearchProvider, ContextualSearchQuery } from "@tokenring-ai/chat/ContextualSearchProvider";
import { formatContextualTag } from "@tokenring-ai/chat/contextualSearch/tags";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import { topLevelRoots } from "../util/allowedPaths.ts";
import attachFailureReason from "../util/attachFailureReason.ts";
import browserIgnoreFilter from "../util/browserIgnoreFilter.ts";
import directoryListing from "../util/directoryListing.ts";
import { listWorkspaceFiles } from "../util/workspaceFileIndex.ts";

const PROVIDER_ID = "file";
const CATEGORY_ID = "filesystems";
const CATEGORY_LABEL = "Files";

export default class FilesystemContextualSearchProvider implements ContextualSearchProvider {
  readonly id = PROVIDER_ID;
  readonly categoryId = CATEGORY_ID;
  readonly categoryLabel = CATEGORY_LABEL;

  constructor(private readonly app: TokenRingApp) {}

  isAvailable(agent: Agent): boolean {
    return !!(agent.getService(FileSystemService) ?? this.app.getService(FileSystemService));
  }

  /** Host files only, honoring .gitignore and .aiignore: this runs on every keystroke after `@`. */
  async search({ query, limit, agent }: ContextualSearchQuery): Promise<ContextualSearchItem[]> {
    const fileSystem = agent.getService(FileSystemService) ?? this.app.requireService(FileSystemService);
    const needle = query.trim().toLowerCase();
    const files: string[] = [];
    for (const root of topLevelRoots(fileSystem.getAllowedPaths())) {
      const ignoreFilter = await browserIgnoreFilter(fileSystem.host, root.path);
      files.push(...(await listWorkspaceFiles(fileSystem.host, root.path, { ignoreFilter, variant: "gitignore" })));
    }
    return rankFiles(files, needle)
      .slice(0, limit)
      .map(filePath => ({
        id: filePath,
        tag: formatContextualTag(PROVIDER_ID, filePath),
        title: fileTitle(filePath),
        subtitle: filePath,
        categoryId: CATEGORY_ID,
        categoryLabel: CATEGORY_LABEL,
        score: fileScore(filePath, needle),
      }));
  }

  async resolve({ itemId }: { itemId: string }, input: InputMessage, agent: Agent): Promise<void> {
    const filePath = parseFileItemId(itemId);
    if (!filePath) return;

    const fileSystem = agent.getService(FileSystemService) ?? this.app.getService(FileSystemService);
    if (!fileSystem) return;

    const attachments = (input.attachments ??= []);
    if (attachments.some(attachment => attachment.name === filePath)) return;
    if (agent.getState(FileSystemState).readFiles.has(filePath)) return;

    try {
      await attachViaService(fileSystem, filePath, attachments, agent);
    } catch (error: unknown) {
      agent.warningMessage(`Couldn't attach ${filePath}: ${attachFailureReason(error)}`);
    }
  }
}

/** Item ids are absolute host paths. Tags saved before the host-only model carry a `<provider>:` prefix. */
function parseFileItemId(itemId: string): string | null {
  if (path.isAbsolute(itemId)) return itemId;
  const separator = itemId.indexOf(":");
  const rest = separator > 0 ? itemId.slice(separator + 1) : "";
  return path.isAbsolute(rest) ? rest : null;
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

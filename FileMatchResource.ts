import type { Agent } from "@tokenring-ai/agent";
import type { ParsedCodeBaseResource } from "@tokenring-ai/codebase/schema";
import FileSystemService from "./FileSystemService.ts";

type ItemMatch = { path: string; include: RegExp | undefined; exclude: RegExp | undefined };

/**
 * Class representing a file tree context extending DirectoryService.
 */
export default class FileMatchResource {
  readonly itemMatches: ItemMatch[];
  constructor(private readonly options: ParsedCodeBaseResource) {
    this.itemMatches = options.items.map(item => ({
      path: item.path,
      include: item.include ? new RegExp(item.include) : undefined,
      exclude: item.exclude ? new RegExp(item.exclude) : undefined,
    }));
  }

  /**
   * Asynchronously gets matched files
   */
  async *getMatchedFiles(agent: Agent): AsyncGenerator<string> {
    const fileSystem = agent.requireServiceByType(FileSystemService);

    for (const { path, include, exclude } of this.itemMatches) {
      for await (const relPath of fileSystem.getDirectoryTree(path, {}, agent)) {
        if (exclude?.test(relPath) || !include?.test(relPath)) continue;
        yield relPath;
      }
    }
  }

  async addFilesToSet(set: Set<string>, agent: Agent): Promise<void> {
    for await (const relPath of this.getMatchedFiles(agent)) {
      set.add(relPath);
    }
  }
}

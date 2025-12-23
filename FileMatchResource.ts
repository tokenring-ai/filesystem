// Keep .ts extension for NodeNext/ESM compatibility in TS source
import {Agent} from "@tokenring-ai/agent";
import FileSystemService from "./FileSystemService.ts";

export interface MatchItem {
  path: string;
  include?: RegExp;
  exclude?: RegExp;
}

/**
 * Class representing a file tree context extending DirectoryService.
 */
export default class FileMatchResource {
  private readonly items: MatchItem[];

  constructor({items}: { items: MatchItem[] }) {
    this.items = items;
  }

  /**
   * Asynchronously gets matched files
   */
  async* getMatchedFiles(agent: Agent): AsyncGenerator<string> {
    const fileSystem = agent.requireServiceByType(FileSystemService);

    for (const {path, include, exclude} of this.items) {
      for await (const relPath of fileSystem.getDirectoryTree(path)) {
        if (exclude?.test(relPath) || include?.test(relPath) === false)
          continue;
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

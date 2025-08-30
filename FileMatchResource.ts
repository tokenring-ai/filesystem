import {type Registry} from "@token-ring/registry";
// Keep .ts extension for NodeNext/ESM compatibility in TS source
import FileSystemService from "./FileSystemService.ts";

export interface MatchItem {
  path: string;
  include?: RegExp;
  exclude?: RegExp;
}

export interface FileMatchResourceConfig {
  items: MatchItem[];
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
  async* getMatchedFiles(registry: Registry): AsyncGenerator<string> {
    const fileSystem = registry.requireFirstServiceByType(FileSystemService);

    for (const {path, include, exclude} of this.items) {
      for await (const relPath of fileSystem.getDirectoryTree(path)) {
        if (exclude?.test(relPath) || include?.test(relPath) === false) continue;
        yield relPath;
      }
    }
  }

  async addFilesToSet(set: Set<string>, registry: Registry): Promise<void> {
    for await (const relPath of this.getMatchedFiles(registry)) {
      set.add(relPath);
    }
  }
}

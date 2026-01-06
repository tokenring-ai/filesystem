import type {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";
import {z} from "zod";
import {FileSystemConfigSchema} from "../schema.ts";

export class FileSystemState implements AgentStateSlice {
  name = "FileSystemState";
  selectedFiles: Set<string>;
  providerName: string | null;
  dirty: boolean = false;
  readFiles: Set<string> = new Set();

  fileWrite: z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileWrite"];
  fileRead:  z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileRead"];
  fileSearch: z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileSearch"];

  constructor(readonly initialConfig: z.output<typeof FileSystemConfigSchema>["agentDefaults"]) {
    this.selectedFiles = new Set(initialConfig.selectedFiles);
    this.providerName = initialConfig.provider ?? null
    this.fileRead = initialConfig.fileRead;
    this.fileWrite = initialConfig.fileWrite;
    this.fileSearch = initialConfig.fileSearch;
  }

  reset(what: ResetWhat[]): void {
    if (what.includes("chat")) {
      this.selectedFiles = new Set(this.initialConfig.selectedFiles);
      this.dirty = false;
      this.readFiles.clear();
    }
  }

  serialize(): object {
    return {
      selectedFiles: Array.from(this.selectedFiles),
      activeFileSystemProviderName: this.providerName,
      dirty: this.dirty,
      fileRead: this.fileRead,
      fileSearch: this.fileSearch,
      fileWrite: this.fileWrite,
      readFiles: Array.from(this.readFiles)
    };
  }

  deserialize(data: any): void {
    this.selectedFiles = new Set(data.selectedFiles);
    this.providerName = data.activeFileSystemProviderName;
    this.dirty = data.dirty;
    this.fileRead = data.fileRead ?? this.initialConfig.fileRead;
    this.fileSearch = data.fileSearch ?? this.initialConfig.fileSearch;
    this.fileWrite = data.fileWrite ?? this.initialConfig.fileWrite;
    this.readFiles = new Set(data.readFiles ?? []);
  }

  show(): string[] {
    return [
      `Provider: ${this.providerName}`,
      `Dirty: ${this.dirty}`,
      `Selected Files and Directories: ${this.selectedFiles.size}`,
      ...Array.from(this.selectedFiles).map(f => `  - ${f}`)
    ];
  }
}

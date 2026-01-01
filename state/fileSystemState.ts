import type {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";
import {z} from "zod";
import {FileSystemConfigSchema} from "../index.ts";

export class FileSystemState implements AgentStateSlice {
  name = "FileSystemState";
  selectedFiles: Set<string>;
  providerName: string | null;
  dirty: boolean = false;
  requireReadBeforeWrite: boolean;
  readFiles: Set<string> = new Set();

  constructor(readonly initialConfig: z.output<typeof FileSystemConfigSchema>["agentDefaults"]) {
    this.selectedFiles = new Set(initialConfig.selectedFiles);
    this.providerName = initialConfig.provider ?? null
    this.requireReadBeforeWrite = initialConfig.requireReadBeforeWrite;
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
      requireReadBeforeWrite: this.requireReadBeforeWrite,
      readFiles: Array.from(this.readFiles)
    };
  }

  deserialize(data: any): void {
    this.selectedFiles = new Set(data.selectedFiles);
    this.providerName = data.activeFileSystemProviderName;
    this.dirty = data.dirty;
    this.requireReadBeforeWrite = data.requireReadBeforeWrite ?? this.initialConfig.requireReadBeforeWrite;
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

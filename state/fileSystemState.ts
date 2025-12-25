import type {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";
import {string, z} from "zod";
import {FileSystemAgentConfigSchema} from "../index.ts";

type FileSystemStateConfig = {
  providerName: string,
  selectedFiles: string[],
  requireReadBeforeWrite: boolean
};

export class FileSystemState implements AgentStateSlice {
  name = "FileSystemState";
  selectedFiles: Set<string>;
  providerName: string;
  dirty: boolean = false;
  requireReadBeforeWrite: boolean;
  readFiles: Set<string> = new Set();

  constructor(readonly initialConfig: FileSystemStateConfig) {
    this.selectedFiles = new Set(initialConfig.selectedFiles);
    this.providerName = initialConfig.providerName;
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

import type {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";
import {z} from "zod";
import {FileSystemConfigSchema} from "../schema.ts";

const serializationSchema = z.object({
  selectedFiles: z.array(z.string()),
  activeFileSystemProviderName: z.string().nullable(),
  dirty: z.boolean(),
  fileRead: FileSystemConfigSchema.shape.agentDefaults.shape.fileRead,
  fileSearch: FileSystemConfigSchema.shape.agentDefaults.shape.fileSearch,
  fileWrite: FileSystemConfigSchema.shape.agentDefaults.shape.fileWrite,
  readFiles: z.array(z.string())
});

export class FileSystemState implements AgentStateSlice<typeof serializationSchema> {
  name = "FileSystemState";
  serializationSchema = serializationSchema;
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

  serialize(): z.output<typeof serializationSchema> {
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

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.selectedFiles = new Set(data.selectedFiles);
    this.providerName = data.activeFileSystemProviderName;
    this.dirty = data.dirty;
    this.fileRead = data.fileRead;
    this.fileSearch = data.fileSearch;
    this.fileWrite = data.fileWrite;
    this.readFiles = new Set(data.readFiles);
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

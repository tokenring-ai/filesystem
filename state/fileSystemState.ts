import { AgentStateSlice } from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import { z } from "zod";
import { FileSystemConfigSchema } from "../schema.ts";

const serializationSchema = z.object({
  selectedFiles: z.array(z.string()),
  activeFileSystemProviderName: z.string().nullable(),
  workingDirectory: z.string(),
  dirty: z.boolean(),
  fileRead: FileSystemConfigSchema.shape.agentDefaults.shape.fileRead,
  fileGrep: FileSystemConfigSchema.shape.agentDefaults.shape.fileGrep,
  fileWrite: FileSystemConfigSchema.shape.agentDefaults.shape.fileWrite,
  fileEdit: FileSystemConfigSchema.shape.agentDefaults.shape.fileEdit,
  readFiles: z.record(z.string(), z.number()),
});

export class FileSystemState extends AgentStateSlice<typeof serializationSchema> {
  selectedFiles: Set<string>;
  providerName: string | null;
  workingDirectory: string;
  dirty: boolean = false;
  readFiles: Map<string, number> = new Map();

  fileWrite: z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileWrite"];
  fileRead: z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileRead"];
  fileGrep: z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileGrep"];
  fileEdit: z.output<typeof FileSystemConfigSchema>["agentDefaults"]["fileEdit"];

  constructor(readonly initialConfig: z.output<typeof FileSystemConfigSchema>["agentDefaults"]) {
    super("FileSystemState", serializationSchema);
    this.selectedFiles = new Set(initialConfig.selectedFiles);
    this.providerName = initialConfig.provider ?? null;
    this.workingDirectory = initialConfig.workingDirectory;
    this.fileRead = initialConfig.fileRead;
    this.fileWrite = initialConfig.fileWrite;
    this.fileGrep = initialConfig.fileGrep;
    this.fileEdit = initialConfig.fileEdit;
  }

  reset(): void {
    this.providerName = this.initialConfig.provider ?? null;
    this.workingDirectory = this.initialConfig.workingDirectory;
    this.selectedFiles = new Set(this.initialConfig.selectedFiles);
    this.dirty = false;
    this.readFiles.clear();
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      selectedFiles: Array.from(this.selectedFiles),
      activeFileSystemProviderName: this.providerName,
      workingDirectory: this.workingDirectory,
      dirty: this.dirty,
      fileRead: this.fileRead,
      fileGrep: this.fileGrep,
      fileWrite: this.fileWrite,
      fileEdit: this.fileEdit,
      readFiles: Object.fromEntries(this.readFiles),
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.selectedFiles = new Set(data.selectedFiles);
    this.providerName = data.activeFileSystemProviderName;
    this.workingDirectory = data.workingDirectory;
    this.dirty = data.dirty;
    this.fileRead = data.fileRead;
    this.fileGrep = data.fileGrep;
    this.fileWrite = data.fileWrite;
    this.fileEdit = data.fileEdit;
    this.readFiles = new Map(Object.entries(data.readFiles).map(([k, v]) => [k, Number(v)]));
  }

  show(): string {
    return `Provider: ${this.providerName}
Working Directory: ${this.workingDirectory}
Dirty: ${this.dirty}
Selected Files and Directories: ${this.selectedFiles.size}
Read Files with modification times: ${this.readFiles.size}
${markdownList(Array.from(this.readFiles.entries()).map(([file, timestamp]) => `${file}: ${new Date(timestamp).toISOString()}`))}`;
  }
}

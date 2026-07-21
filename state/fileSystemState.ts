import { AgentStateSlice } from "@tokenring-ai/agent/types";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import { z } from "zod";
import { type FileSystemConfigSchema, FileSystemToolSettingsSchema } from "../schema.ts";

const serializationSchema = z.object({
  selectedFiles: z.array(z.string()),
  activeFileSystemProviderName: z.string().nullable(),
  workingDirectory: z.string(),
  dirty: z.boolean(),
  settings: FileSystemToolSettingsSchema,
  readFiles: z.record(z.string(), z.number()),
  hasInjectedRelatedFiles: z.boolean(),
  fileEditFailureCount: z.number(),
});

export class FileSystemState extends AgentStateSlice<typeof serializationSchema> {
  selectedFiles: Set<string>;
  providerName: string | null;
  workingDirectory: string;
  dirty: boolean = false;
  readFiles: Map<string, number> = new Map();
  hasInjectedRelatedFiles: boolean = false;
  fileEditFailureCount: number = 0;

  settings: z.output<typeof FileSystemToolSettingsSchema>;

  constructor(readonly initialConfig: z.output<typeof FileSystemConfigSchema>["agentDefaults"]) {
    super("FileSystemState", serializationSchema);
    this.selectedFiles = new Set(initialConfig.selectedFiles);
    this.providerName = initialConfig.provider;
    this.workingDirectory = initialConfig.workingDirectory;
    this.settings = deepClone(initialConfig.settings);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      selectedFiles: Array.from(this.selectedFiles),
      activeFileSystemProviderName: this.providerName,
      workingDirectory: this.workingDirectory,
      dirty: this.dirty,
      settings: this.settings,
      readFiles: Object.fromEntries(this.readFiles),
      hasInjectedRelatedFiles: this.hasInjectedRelatedFiles,
      fileEditFailureCount: this.fileEditFailureCount,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.selectedFiles = new Set(data.selectedFiles);
    this.providerName = data.activeFileSystemProviderName;
    this.workingDirectory = data.workingDirectory;
    this.dirty = data.dirty;
    this.settings = data.settings;
    this.readFiles = new Map(Object.entries(data.readFiles).map(([k, v]) => [k, Number(v)]));
    this.hasInjectedRelatedFiles = data.hasInjectedRelatedFiles;
    this.fileEditFailureCount = data.fileEditFailureCount;
  }

  show(): string {
    return `Provider: ${this.providerName}
Working Directory: ${this.workingDirectory}
Dirty: ${this.dirty}
Selected Files and Directories: ${this.selectedFiles.size}
Read Files with modification times: ${this.readFiles.size}
Has Injected Related Files: ${this.hasInjectedRelatedFiles}
File Edit Failure Count: ${this.fileEditFailureCount}
${markdownList(Array.from(this.readFiles.entries()).map(([file, timestamp]) => `${file}: ${new Date(timestamp).toISOString()}`))}`;
  }
}

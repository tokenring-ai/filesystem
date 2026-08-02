import { AgentStateSlice } from "@tokenring-ai/agent/types";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import EnhancedSet from "@tokenring-ai/utility/set/enhancedSet";
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
  hasInjectedSimilarFiles: z.boolean(),
  fileEditFailureCount: z.number(),
});

export class FileSystemState extends AgentStateSlice<typeof serializationSchema> {
  selectedFiles: EnhancedSet<string>;
  providerName: string | null;
  workingDirectory: string;
  dirty: boolean = false;
  readFiles = new EnhancedMap<string, number>();
  hasInjectedSimilarFiles: boolean = false;
  fileEditFailureCount: number = 0;

  settings: z.output<typeof FileSystemToolSettingsSchema>;

  constructor(readonly initialConfig: z.output<typeof FileSystemConfigSchema>["agentDefaults"]) {
    super("FileSystemState", serializationSchema);
    this.selectedFiles = new EnhancedSet(initialConfig.selectedFiles);
    this.providerName = initialConfig.provider;
    this.workingDirectory = initialConfig.workingDirectory;
    this.settings = deepClone(initialConfig.settings);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      selectedFiles: this.selectedFiles.valuesArray(),
      activeFileSystemProviderName: this.providerName,
      workingDirectory: this.workingDirectory,
      dirty: this.dirty,
      settings: this.settings,
      readFiles: this.readFiles.toPlainObject(),
      hasInjectedSimilarFiles: this.hasInjectedSimilarFiles,
      fileEditFailureCount: this.fileEditFailureCount,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.selectedFiles = new EnhancedSet(data.selectedFiles);
    this.providerName = data.activeFileSystemProviderName;
    this.workingDirectory = data.workingDirectory;
    this.dirty = data.dirty;
    this.settings = data.settings;
    this.readFiles = EnhancedMap.fromPlainObject(data.readFiles);
    this.hasInjectedSimilarFiles = data.hasInjectedSimilarFiles;
    this.fileEditFailureCount = data.fileEditFailureCount;
  }

  show(): string {
    return `Provider: ${this.providerName}
Working Directory: ${this.workingDirectory}
Dirty: ${this.dirty}
Selected Files and Directories: ${this.selectedFiles.size}
Read Files with modification times: ${this.readFiles.size}
Has Injected Related Files: ${this.hasInjectedSimilarFiles}
File Edit Failure Count: ${this.fileEditFailureCount}
${markdownList(this.readFiles.mapEntries(([file, timestamp]) => `${file}: ${new Date(timestamp).toISOString()}`))}`;
  }
}

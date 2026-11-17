import path from "node:path";
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import EnhancedSet from "@tokenring-ai/utility/set/enhancedSet";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import { z } from "zod";
import { type FileSystemConfigSchema, FileSystemToolSettingsSchema } from "../schema.ts";

const serializationSchema = z.object({
  selectedFiles: z.array(z.string()),
  // Legacy field from before the allow-list model; ignored on restore.
  workingDirectory: z.string().optional(),
  dirty: z.boolean(),
  settings: FileSystemToolSettingsSchema,
  readFiles: z.record(z.string(), z.number()),
  hasInjectedSimilarFiles: z.boolean(),
  fileEditFailureCount: z.number().default(0),
  /** Counts writes, so other plugins can tell whether files changed since they last looked. */
  writeCount: z.number().default(0),
});

export class FileSystemState extends AgentStateSlice<typeof serializationSchema> {
  selectedFiles: EnhancedSet<string>;
  dirty: boolean = false;
  readFiles = new EnhancedMap<string, number>();
  hasInjectedSimilarFiles: boolean = false;
  fileEditFailureCount: number = 0;
  /** Incremented on every write; never reset (unlike {@link dirty}, which a commit clears). */
  writeCount: number = 0;

  settings: z.output<typeof FileSystemToolSettingsSchema>;

  constructor(readonly initialConfig: Omit<z.output<typeof FileSystemConfigSchema>["agentDefaults"], "workingDirectory">) {
    super("FileSystemState", serializationSchema);
    this.selectedFiles = new EnhancedSet(initialConfig.selectedFiles);
    this.settings = deepClone(initialConfig.settings);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      selectedFiles: this.selectedFiles.valuesArray(),
      dirty: this.dirty,
      settings: this.settings,
      readFiles: this.readFiles.toPlainObject(),
      hasInjectedSimilarFiles: this.hasInjectedSimilarFiles,
      fileEditFailureCount: this.fileEditFailureCount,
      writeCount: this.writeCount,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    // Relative entries predate the absolute-path model and have no resolution base; drop them.
    this.selectedFiles = new EnhancedSet(data.selectedFiles.filter(file => path.isAbsolute(file)));
    this.dirty = data.dirty;
    this.settings = data.settings;
    this.readFiles = new EnhancedMap(Object.entries(data.readFiles).filter(([file]) => path.isAbsolute(file)));
    this.hasInjectedSimilarFiles = data.hasInjectedSimilarFiles;
    this.fileEditFailureCount = data.fileEditFailureCount;
    this.writeCount = data.writeCount;
  }

  show(): string {
    return `Dirty: ${this.dirty}
Selected Files and Directories: ${this.selectedFiles.size}
Read Files with modification times: ${this.readFiles.size}
Has Injected Related Files: ${this.hasInjectedSimilarFiles}
File Edit Failure Count: ${this.fileEditFailureCount}
${markdownList(this.readFiles.mapEntries(([file, timestamp]) => `${file}: ${new Date(timestamp).toISOString()}`))}`;
  }
}

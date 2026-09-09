import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

export const FileMatchSchema = z.object({
  path: z.string(),
  include: z
    .string()
    .exactOptional()
    .meta({ uiType: "regex", description: "Regex matched against file paths relative to the watch root to include" } satisfies ConfigFieldMeta),
  exclude: z
    .string()
    .exactOptional()
    .meta({ uiType: "regex", description: "Regex matched against file paths relative to the watch root to exclude" } satisfies ConfigFieldMeta),
});

export const AllowedPathPermissionSchema = z.enum(["read", "write"]);

export const AllowedPathSchema = z.object({
  path: z.string().meta({ description: "Absolute directory the agent may access (in the provider's namespace)" } satisfies ConfigFieldMeta),
  permission: AllowedPathPermissionSchema.default("write").meta({
    description: "read = list/read only; write = read plus create/modify/delete",
  } satisfies ConfigFieldMeta),
  provider: z
    .string()
    .exactOptional()
    .meta({ description: "Filesystem provider this entry applies to (defaults to agentDefaults.provider)" } satisfies ConfigFieldMeta),
  description: z
    .string()
    .exactOptional()
    .meta({ description: "Optional label shown to the model and in Settings" } satisfies ConfigFieldMeta),
});

export type AllowedPath = z.output<typeof AllowedPathSchema>;

export type ParsedFileMatch = z.output<typeof FileMatchSchema>;

export const StatExistsSchema = z.object({
  path: z.string(),
  absolutePath: z.string().exactOptional(),
  exists: z.literal(true),
  isFile: z.boolean().exactOptional(),
  isDirectory: z.boolean().exactOptional(),
  isSymbolicLink: z.boolean().exactOptional(),
  size: z.number().exactOptional(),
  created: z.string().exactOptional(),
  modified: z.string().exactOptional(),
  accessed: z.string().exactOptional(),
});

export const StatNotExistsSchema = z.object({
  path: z.string(),
  exists: z.literal(false),
});

export const StatSchema = z.discriminatedUnion("exists", [StatExistsSchema, StatNotExistsSchema]);

export const FileSystemToolSettingsSchema = z.object({
  requireReadBeforeWrite: z
    .boolean()
    .default(true)
    .meta({ description: "Require the agent to read a file before it may overwrite it" } satisfies ConfigFieldMeta),
  maxReturnedDiffSize: z
    .number()
    .min(0)
    .default(1024)
    .meta({ unit: "bytes", description: "Largest diff echoed back to the agent after a write" } satisfies ConfigFieldMeta),
  validateWrittenFiles: z
    .boolean()
    .default(true)
    .meta({ description: "Run registered validators (syntax checks, linters) on written files" } satisfies ConfigFieldMeta),
  maxFileReadCount: z
    .number()
    .min(1)
    .default(10)
    .meta({ description: "Most files a single read request may return" } satisfies ConfigFieldMeta),
  maxTextFileReadSize: z
    .number()
    .min(1024)
    .default(128 * 1024) // 128KB default
    .meta({ unit: "bytes", description: "Largest text file the agent will read in full" } satisfies ConfigFieldMeta),
  imageFileMaxResolution: z
    .number()
    .min(1)
    .default(1024 * 1024)
    .meta({ unit: "pixels", description: "Largest image resolution the agent will read in full without downsampling" } satisfies ConfigFieldMeta),
  maxSearchSnippetCount: z
    .number()
    .min(1)
    .default(10)
    .meta({ description: "Most matching snippets returned per search" } satisfies ConfigFieldMeta),
  maxSearchSnippetSizePercent: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .meta({ description: "Cap on a single snippet's share of the result budget" } satisfies ConfigFieldMeta),
  searchSnippetLinesBefore: z
    .number()
    .min(0)
    .default(5)
    .meta({ description: "Context lines shown before each match" } satisfies ConfigFieldMeta),
  searchSnippetLinesAfter: z
    .number()
    .min(0)
    .default(5)
    .meta({ description: "Context lines shown after each match" } satisfies ConfigFieldMeta),
  maxGlobbedFiles: z
    .number()
    .min(1)
    .default(250)
    .meta({ description: "Most files a single globbed file search may match" } satisfies ConfigFieldMeta),
  maxGrepResults: z
    .number()
    .min(1)
    .default(250)
    .meta({ description: "Most file matches a single grep/search operation may return before summarizing by directory" } satisfies ConfigFieldMeta),
  globSummaryDepth: z
    .number()
    .min(0)
    .default(2)
    .meta({ description: "Directory depth used when summarizing matches beyond the file limit" } satisfies ConfigFieldMeta),
  fileEdit: z
    .object({
      enabled: z
        .boolean()
        .default(true)
        .meta({ description: "Allow agents to use the in-place file edit tool" } satisfies ConfigFieldMeta),
      disableAfterConsecutiveFailures: z
        .number()
        .min(1)
        .default(2)
        .meta({ description: "Disable the edit tool for a file after this many consecutive failed edits" } satisfies ConfigFieldMeta),
    })
    .prefault({})
    .meta({ label: "File Edit", advanced: true, description: "Behavior of the in-place file edit tool" } satisfies ConfigFieldMeta),
});

const AddToQueueActionSchema = z.object({
  action: z.literal("addToQueue"),
  queue: z.string().meta({ description: "Name of the queue to submit the file to" } satisfies ConfigFieldMeta),
});

const TriggeredActionSchema = z.discriminatedUnion("action", [AddToQueueActionSchema]);

export const FileWatchSchema = FileMatchSchema.extend({
  provider: z
    .string()
    .exactOptional()
    .meta({ description: "Filesystem provider to watch (defaults to agentDefaults.provider)" } satisfies ConfigFieldMeta),
  contentIncludes: z
    .string()
    .exactOptional()
    .meta({ uiType: "regex", description: "Regex pattern matched against the content" } satisfies ConfigFieldMeta),
  stabilityThreshold: z
    .number()
    .default(5000)
    .meta({ unit: "ms", description: "Quiet time required before a changed file is considered stable" } satisfies ConfigFieldMeta),
  actions: z.array(TriggeredActionSchema).meta({ description: "Actions to run when a matching file stabilizes after a change" } satisfies ConfigFieldMeta),
});

export type ParsedFileWatch = z.output<typeof FileWatchSchema>;
export type ParsedTriggeredAction = z.output<typeof TriggeredActionSchema>;

export const FileSystemAgentConfigSchema = z
  .object({
    provider: z.string().exactOptional(),
    /** @deprecated Ignored. Filesystem access is governed by `filesystem.allowedPaths`. */
    workingDirectory: z
      .string()
      .exactOptional()
      .meta({ hidden: true, description: "Deprecated; ignored. Use filesystem.allowedPaths." } satisfies ConfigFieldMeta),
    selectedFiles: z.array(z.string()).exactOptional(),
    settings: FileSystemToolSettingsSchema.partial().optional(),
  })
  .strict()
  .default({});

export const FileSystemConfigSchema = z
  .object({
    agentDefaults: z
      .object({
        provider: z
          .string()
          .default("posix")
          .meta({ description: "Filesystem provider new agents use by default (e.g. posix)" } satisfies ConfigFieldMeta),
        /** @deprecated Ignored. Filesystem access is governed by `filesystem.allowedPaths`. */
        workingDirectory: z
          .string()
          .exactOptional()
          .meta({ hidden: true, description: "Deprecated; ignored. Use filesystem.allowedPaths." } satisfies ConfigFieldMeta),
        selectedFiles: z
          .array(z.string())
          .default([])
          .meta({ description: "Files preselected into new agents' context" } satisfies ConfigFieldMeta),
        settings: FileSystemToolSettingsSchema.meta({ label: "Filesystem Tool Settings" } satisfies ConfigFieldMeta).prefault({}),
      })
      .prefault({})
      .meta({ label: "Agent Defaults", description: "Filesystem behavior applied to newly created agents" } satisfies ConfigFieldMeta),
    allowedPaths: z
      .array(AllowedPathSchema)
      .default([])
      .meta({ label: "Allowed Paths", description: "Directories agents may access with the filesystem and terminal tools" } satisfies ConfigFieldMeta),
    watch: z
      .record(z.string(), FileWatchSchema)
      .default({})
      .meta({ label: "File Watching", description: "Automatically trigger actions when files change" } satisfies ConfigFieldMeta),
  })
  .strict()
  .prefault({})
  .meta({ label: "Filesystem", description: "Filesystem access for agents" } satisfies ConfigFieldMeta);

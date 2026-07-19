import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

export const FileMatchSchema = z.object({
  path: z.string(),
  include: z.string().exactOptional(),
  exclude: z.string().exactOptional(),
});

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

export const FileSystemAgentConfigSchema = z
  .object({
    provider: z.string().exactOptional(),
    workingDirectory: z.string().exactOptional(),
    selectedFiles: z.array(z.string()).exactOptional(),
    fileWrite: z
      .object({
        requireReadBeforeWrite: z.boolean().exactOptional(),
        maxReturnedDiffSize: z.number().exactOptional(),
        validateWrittenFiles: z.boolean().exactOptional(),
      })
      .exactOptional(),
    fileRead: z
      .object({
        maxFileReadCount: z.number().exactOptional(),
        maxFileSize: z.number().exactOptional(),
      })
      .exactOptional(),
    fileGrep: z
      .object({
        maxSnippetCount: z.number().exactOptional(),
        maxSnippetSizePercent: z.number().exactOptional(),
        snippetLinesBefore: z.number().exactOptional(),
        snippetLinesAfter: z.number().exactOptional(),
        maxMatchedFiles: z.number().exactOptional(),
        summaryDepth: z.number().exactOptional(),
      })
      .exactOptional(),
    fileEdit: z
      .object({
        enabled: z.boolean().exactOptional(),
        fuzzyMatchSimilarity: z.number().min(0.7).max(1).exactOptional(),
        minimumMatchedCharacters: z.number().exactOptional(),
        consecutiveFailureCount: z.number().exactOptional(),
        disableAfterConsecutiveFailures: z.number().exactOptional(),
      })
      .exactOptional(),
  })
  .strict()
  .default({});

export const FileSystemConfigSchema = z
  .object({
    agentDefaults: z
      .object({
        provider: z.string().meta({ description: "Filesystem provider new agents use by default (e.g. posix)" } satisfies ConfigFieldMeta),
        workingDirectory: z.string().meta({ hidden: true } satisfies ConfigFieldMeta), // injected from --projectDirectory at launch
        selectedFiles: z
          .array(z.string())
          .default([])
          .meta({ description: "Files preselected into new agents' context" } satisfies ConfigFieldMeta),
        fileWrite: z
          .object({
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
          })
          .prefault({})
          .meta({ label: "File Write", advanced: true, description: "Safeguards applied when agents write files" } satisfies ConfigFieldMeta),
        fileRead: z
          .object({
            maxFileReadCount: z
              .number()
              .min(1)
              .default(10)
              .meta({ description: "Most files a single read request may return" } satisfies ConfigFieldMeta),
            maxFileSize: z
              .number()
              .min(1024)
              .default(128 * 1024) // 128KB default
              .meta({ unit: "bytes", description: "Largest file the agent will read in full" } satisfies ConfigFieldMeta),
          })
          .prefault({})
          .meta({ label: "File Read", advanced: true, description: "Limits applied when agents read files" } satisfies ConfigFieldMeta),
        fileGrep: z
          .object({
            maxSnippetCount: z
              .number()
              .min(1)
              .default(10)
              .meta({ description: "Most matching snippets returned per search" } satisfies ConfigFieldMeta),
            maxSnippetSizePercent: z
              .number()
              .min(0)
              .max(1)
              .default(0.3)
              .meta({ description: "Cap on a single snippet's share of the result budget" } satisfies ConfigFieldMeta),
            snippetLinesBefore: z
              .number()
              .min(0)
              .default(5)
              .meta({ description: "Context lines shown before each match" } satisfies ConfigFieldMeta),
            snippetLinesAfter: z
              .number()
              .min(0)
              .default(5)
              .meta({ description: "Context lines shown after each match" } satisfies ConfigFieldMeta),
            maxMatchedFiles: z
              .number()
              .min(1)
              .default(250)
              .meta({ description: "Most files a single search may match" } satisfies ConfigFieldMeta),
            summaryDepth: z
              .number()
              .min(0)
              .default(2)
              .meta({ description: "Directory depth used when summarizing matches beyond the file limit" } satisfies ConfigFieldMeta),
          })
          .prefault({})
          .meta({ label: "File Search", advanced: true, description: "Limits applied when agents search file contents" } satisfies ConfigFieldMeta),
        fileEdit: z
          .object({
            enabled: z
              .boolean()
              .default(true)
              .meta({ description: "Allow agents to use the in-place file edit tool" } satisfies ConfigFieldMeta),
            fuzzyMatchSimilarity: z
              .number()
              .min(0.7)
              .max(1)
              .default(0.85)
              .meta({ uiType: "slider", description: "Similarity threshold for fuzzy-matching edit targets" } satisfies ConfigFieldMeta),
            minimumMatchedCharacters: z
              .number()
              .min(1)
              .default(15)
              .meta({ description: "Fewest characters an edit target may match" } satisfies ConfigFieldMeta),
            consecutiveFailureCount: z
              .number()
              .min(0)
              .default(0)
              .meta({ hidden: true } satisfies ConfigFieldMeta), // runtime counter, not a setting
            disableAfterConsecutiveFailures: z
              .number()
              .min(1)
              .default(2)
              .meta({ description: "Disable the edit tool for a file after this many consecutive failed edits" } satisfies ConfigFieldMeta),
          })
          .prefault({})
          .meta({ label: "File Edit", advanced: true, description: "Behavior of the in-place file edit tool" } satisfies ConfigFieldMeta),
      })
      .meta({ label: "Agent Defaults", description: "Filesystem behavior applied to newly created agents" } satisfies ConfigFieldMeta),
  })
  .strict()
  .meta({ label: "Filesystem", description: "Filesystem access for agents" } satisfies ConfigFieldMeta);

export type FileSystemAgentConfig = {
  filesystem: z.input<typeof FileSystemAgentConfigSchema>;
};

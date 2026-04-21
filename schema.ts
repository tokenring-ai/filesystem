import z from "zod";

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
    agentDefaults: z.object({
      provider: z.string(),
      workingDirectory: z.string(),
      selectedFiles: z.array(z.string()).default([]),
      fileWrite: z
        .object({
          requireReadBeforeWrite: z.boolean().default(true),
          maxReturnedDiffSize: z.number().default(1024),
          validateWrittenFiles: z.boolean().default(true),
        })
        .prefault({}),
      fileRead: z
        .object({
          maxFileReadCount: z.number().default(10),
          maxFileSize: z.number().default(128 * 1024), // 128KB default
        })
        .prefault({}),
      fileGrep: z
        .object({
          maxSnippetCount: z.number().default(10),
          maxSnippetSizePercent: z.number().default(0.3),
          snippetLinesBefore: z.number().default(5),
          snippetLinesAfter: z.number().default(5),
        })
        .prefault({}),
      fileEdit: z
        .object({
          enabled: z.boolean().default(true),
          fuzzyMatchSimilarity: z.number().min(0.7).max(1).default(0.85),
          minimumMatchedCharacters: z.number().default(15),
          consecutiveFailureCount: z.number().default(0),
          disableAfterConsecutiveFailures: z.number().default(2),
        })
        .prefault({}),
    }),
  })
  .strict();

export type FileSystemAgentConfig = {
  filesystem: z.input<typeof FileSystemAgentConfigSchema>;
};

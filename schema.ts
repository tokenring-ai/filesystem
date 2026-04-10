import z from "zod";

export const FileSystemAgentConfigSchema = z
  .object({
    provider: z.string().optional(),
    workingDirectory: z.string().optional(),
    selectedFiles: z.array(z.string()).optional(),
    fileWrite: z
      .object({
        requireReadBeforeWrite: z.boolean().optional(),
        maxReturnedDiffSize: z.number().optional(),
        validateWrittenFiles: z.boolean().optional(),
      })
      .optional(),
    fileRead: z
      .object({
        maxFileReadCount: z.number().optional(),
        maxFileSize: z.number().optional(),
      })
      .optional(),
    fileGrep: z
      .object({
        maxSnippetCount: z.number().optional(),
        maxSnippetSizePercent: z.number().optional(),
        snippetLinesBefore: z.number().optional(),
        snippetLinesAfter: z.number().optional(),
      })
      .optional(),
    fileEdit: z
      .object({
        enabled: z.boolean().optional(),
        disableAfterConsecutiveFailures: z.number().optional(),
      })
      .optional(),
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

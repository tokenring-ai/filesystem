import z from "zod";

export const FileSystemAgentConfigSchema = z.object({
  provider: z.string().optional(),
  selectedFiles: z.array(z.string()).optional(),
  fileWrite: z.object({
    requireReadBeforeWrite: z.boolean().optional(),
    maxReturnedDiffSize: z.number().optional(),
  }).optional(),
  fileRead: z.object({
    maxFileReadCount: z.number().optional(),
    maxFileSize: z.number().default(30 * 1024), // 30KB default
  }).optional(),
  fileSearch: z.object({
    maxSnippetCount: z.number().default(10),
    maxSnippetSizePercent: z.number().default(0.3),
    snippetLinesBefore: z.number().default(5),
    snippetLinesAfter: z.number().default(5),
  }).optional(),
}).strict().default({});

export const FileSystemConfigSchema = z.object({
  agentDefaults: z.object({
    provider: z.string(),
    selectedFiles: z.array(z.string()).default([]),
    fileWrite: z.object({
      requireReadBeforeWrite: z.boolean().default(true),
      maxReturnedDiffSize: z.number().default(1024),
    }).prefault({}),
    fileRead: z.object({
      maxFileReadCount: z.number().default(10),
      maxFileSize: z.number().default(30 * 1024), // 30KB default
    }).prefault({}),
    fileSearch: z.object({
      maxSnippetCount: z.number().default(10),
      maxSnippetSizePercent: z.number().default(0.3),
      snippetLinesBefore: z.number().default(5),
      snippetLinesAfter: z.number().default(5),
    }).prefault({}),
  }),
  providers: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([
    "awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig", "tee",
    "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which", "touch", "mkdir",
    "npm", "yarn", "bun", "tsc", "node", "npx", "bunx", "vitest"
  ]),
  dangerousCommands: z.array(z.string()).default([
    "(^|\\s)dd\\s",
    "(^|\\s)dd\\s",
    "(^|\\s)rm.*-.*r",
    "(^|\\s)chmod.*-.*r",
    "(^|\\s)chown.*-.*r",
    "(^|\\s)rmdir\\s",
    "(^|\\s)rmdir\\s",
    "find.*-(delete|exec)", // for find --delete, find --exec rm
    "(^|\\s)sudo\\s",
    "(^|\\s)del\\s",
    "(^|\\s)format\\s",
    "(^|\\s)reboot",
    "(^|\\s)shutdown",
    "git.*reset", // i.e. git reset
  ])
}).strict();

export type FileSystemAgentConfig = {
  filesystem: z.input<typeof FileSystemAgentConfigSchema>
};
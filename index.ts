import {z} from "zod";

export const FileSystemAgentConfigSchema = z.object({
  provider: z.string().optional(),
  selectedFiles: z.array(z.string()).optional(),
  requireReadBeforeWrite: z.boolean().optional()
}).default({});

export const FileSystemConfigSchema = z.object({
  agentDefaults: z.object({
    provider: z.string(),
    selectedFiles: z.array(z.string()).default([]),
    requireReadBeforeWrite: z.boolean().default(true)
  }),
  providers: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([
    "awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig", "tee",
    "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which",
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
});


export { default as FileMatchResource } from "./FileMatchResource.ts";
export { default as FileSystemService } from "./FileSystemService.ts";

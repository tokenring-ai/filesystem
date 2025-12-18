import {z} from "zod";

export const FileSystemConfigSchema = z.object({
  defaultProvider: z.string(),
  defaultSelectedFiles: z.array(z.string()).optional(),
  providers: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([
    "awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig",
    "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which"
  ]),
  dangerousCommands: z.array(z.string()).default([
    "rm ",
    ">",
    "tee",
    "reboot",
    "reset", // i.e. git reset
  ])
});



export { default as FileMatchResource } from "./FileMatchResource.ts";
export { default as FileSystemService } from "./FileSystemService.ts";

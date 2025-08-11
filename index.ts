// Combined TypeScript source for @token-ring/filesystem
// Provides runtime exports and types from a single .ts file.

export * as chatCommands from "./chatCommands.ts";
export { default as FileMatchResource } from "./FileMatchResource.ts";
export { default as FileSystemService } from "./FileSystemService.ts";
export * as tools from "./tools.ts";

export const name = "@token-ring/filesystem";
export const description = "Service that add file contents or file names to the chat memory.";
export const version = "0.1.0";

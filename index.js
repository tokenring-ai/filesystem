export * as chatCommands from "./chatCommands.ts";
export { default as FileMatchResource } from "./FileMatchResource.js";
export { default as FileSystemService } from "./FileSystemService.js";
export * as tools from "./tools.js";

export const name = "@token-ring/filesystem";
export const description =
	"Service that add file contents or file names to the chat memory.";
export const version = "0.1.0";
